import crypto from 'node:crypto';
import { trimTrailingCharacter } from '../shared/string-suffix.js';
import mysql from 'mysql2/promise';
import { instrumentDatabase } from './services/requestDiagnostics.js';
import './loadEnvironment.js';
import {
  createPlatformOwnerSalt,
  getConfiguredPlatformOwner,
  hashPlatformOwnerPassword,
} from './services/platformOwnerAuth.js';

const platformDatabase = process.env.PLATFORM_MYSQL_DATABASE || 'wajeh_platform';
const databaseNamePattern = /^\w+$/;

if (!databaseNamePattern.test(platformDatabase)) {
  throw new Error('PLATFORM_MYSQL_DATABASE is invalid.');
}

const baseConfig = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 5,
};

let platformPool;

const normalizeUrl = (value) => trimTrailingCharacter(String(value || '').trim(), '/');

export async function initPlatformDatabase(currentComplex = null) {
  const bootstrapPool = mysql.createPool(baseConfig);
  await bootstrapPool.query(`CREATE DATABASE IF NOT EXISTS \`${platformDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await bootstrapPool.end();

  platformPool = instrumentDatabase(mysql.createPool({ ...baseConfig, database: platformDatabase }), platformDatabase, { pool: true });
  await platformPool.query(`
    CREATE TABLE IF NOT EXISTS platform_owners (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(120) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(64) NOT NULL,
      display_name VARCHAR(160) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const configuredOwner = getConfiguredPlatformOwner();
  const singleOwner = String(process.env.PLATFORM_SINGLE_OWNER || '').toLowerCase() === 'true';
  if (configuredOwner) {
    const salt = createPlatformOwnerSalt();
    const passwordHash = await hashPlatformOwnerPassword(configuredOwner.password, salt);
    await platformPool.query(
      `
      INSERT INTO platform_owners (username, password_hash, password_salt, display_name)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        password_hash = VALUES(password_hash),
        password_salt = VALUES(password_salt),
        display_name = VALUES(display_name)
      `,
      [configuredOwner.username, passwordHash, salt, configuredOwner.displayName],
    );
    if (singleOwner) {
      await platformPool.query('DELETE FROM platform_owners WHERE username <> ?', [configuredOwner.username]);
    }
  }
  await platformPool.query(`
    CREATE TABLE IF NOT EXISTS platform_owner_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      owner_id BIGINT UNSIGNED NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX platform_owner_sessions_owner (owner_id),
      CONSTRAINT platform_owner_sessions_owner_fk
        FOREIGN KEY (owner_id) REFERENCES platform_owners(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await platformPool.query(`
    CREATE TABLE IF NOT EXISTS platform_complexes (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      registration_number VARCHAR(32) NOT NULL UNIQUE,
      name VARCHAR(180) NOT NULL,
      status ENUM('pending', 'active', 'inactive') NOT NULL DEFAULT 'pending',
      database_name VARCHAR(120) NULL,
      app_url VARCHAR(500) NULL,
      api_url VARCHAR(500) NULL,
      whatsapp_url VARCHAR(500) NULL,
      contact_name VARCHAR(180) NULL,
      contact_phone VARCHAR(40) NULL,
      manager_name VARCHAR(180) NULL,
      manager_login_number VARCHAR(80) NULL,
      provisioning_error VARCHAR(500) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  const platformColumns = [
    ['whatsapp_url', 'VARCHAR(500) NULL'],
    ['manager_name', 'VARCHAR(180) NULL'],
    ['manager_login_number', 'VARCHAR(80) NULL'],
    ['provisioning_error', 'VARCHAR(500) NULL'],
  ];
  for (const [column, definition] of platformColumns) {
    const [[existing]] = await platformPool.query(
      `
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = ? AND table_name = 'platform_complexes' AND column_name = ?
      `,
      [platformDatabase, column],
    );
    if (!Number(existing.count)) {
      await platformPool.query(`ALTER TABLE platform_complexes ADD COLUMN ${column} ${definition}`);
    }
  }
  await platformPool.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_key CHAR(64) NOT NULL PRIMARY KEY,
      failures TINYINT UNSIGNED NOT NULL DEFAULT 0,
      blocked_until DATETIME NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX login_attempts_cleanup_lookup (updated_at),
      INDEX login_attempts_block_lookup (blocked_until)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (currentComplex?.registrationNumber) {
    await platformPool.query(
      `
      INSERT INTO platform_complexes
        (registration_number, name, status, database_name, app_url, api_url, whatsapp_url)
      VALUES (?, ?, 'active', ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        database_name = COALESCE(VALUES(database_name), database_name),
        app_url = COALESCE(VALUES(app_url), app_url),
        api_url = COALESCE(VALUES(api_url), api_url),
        whatsapp_url = COALESCE(VALUES(whatsapp_url), whatsapp_url)
      `,
      [
        String(currentComplex.registrationNumber),
        String(currentComplex.name),
        currentComplex.databaseName || null,
        normalizeUrl(currentComplex.appUrl) || null,
        normalizeUrl(currentComplex.apiUrl) || null,
        normalizeUrl(currentComplex.whatsappUrl) || null,
      ],
    );
  }
}

export function platformDb() {
  if (!platformPool) throw new Error('Platform database has not been initialized.');
  return platformPool;
}

export async function findComplexByRegistration(registrationNumber) {
  const [[complex]] = await platformDb().query(
    `
    SELECT
      id,
      registration_number AS registrationNumber,
      name,
      status,
      database_name AS databaseName,
      app_url AS appUrl,
      api_url AS apiUrl
    FROM platform_complexes
    WHERE registration_number = ?
    LIMIT 1
    `,
    [String(registrationNumber || '').trim()],
  );
  return complex || null;
}

export function hashPlatformToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
