import mysql from 'mysql2/promise';
import { undoDatabase } from './services/undoJournal.js';
import { instrumentDatabase } from './services/requestDiagnostics.js';
import { readFile } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import './loadEnvironment.js';
import { runPendingDatabaseMigrations } from './databaseMigrations.js';

const config = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'wajeh_nukhab',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
};

const defaultDatabaseName = config.database;
let defaultPool;
const databasePools = new Map();
const databaseInitializations = new Map();
const databasePoolUsage = new Map();
const databaseContext = new AsyncLocalStorage();
const MAX_DATABASE_POOLS = Math.max(5, Number(process.env.MAX_DATABASE_POOLS || 40));
const DATABASE_POOL_IDLE_MS = Math.max(60_000, Number(process.env.DATABASE_POOL_IDLE_MS || 30 * 60_000));
const DATABASE_POOL_SWEEP_MS = Math.max(60_000, Number(process.env.DATABASE_POOL_SWEEP_MS || 5 * 60_000));

function touchDatabasePool(databaseName) {
  const usage = databasePoolUsage.get(databaseName) || { activeContexts: 0, lastUsedAt: 0 };
  usage.lastUsedAt = Date.now();
  databasePoolUsage.set(databaseName, usage);
  return usage;
}

async function closeDatabasePool(databaseName) {
  if (databaseName === defaultDatabaseName) return false;
  const usage = databasePoolUsage.get(databaseName);
  if (usage?.activeContexts) return false;
  const selectedPool = databasePools.get(databaseName);
  if (!selectedPool) return false;
  databasePools.delete(databaseName);
  databasePoolUsage.delete(databaseName);
  await selectedPool.end().catch(() => {});
  return true;
}

async function evictIdleDatabasePools({ reserveSlot = false } = {}) {
  const now = Date.now();
  const candidates = [...databasePoolUsage.entries()]
    .filter(([databaseName, usage]) => (
      databaseName !== defaultDatabaseName
      && !usage.activeContexts
    ))
    .sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt);

  for (const [databaseName, usage] of candidates) {
    const isIdle = now - usage.lastUsedAt >= DATABASE_POOL_IDLE_MS;
    const isOverLimit = reserveSlot && databasePools.size >= MAX_DATABASE_POOLS;
    if (!isIdle && !isOverLimit) continue;
    await closeDatabasePool(databaseName);
  }
}

function activeDatabaseName() {
  return databaseContext.getStore()?.databaseName || defaultDatabaseName;
}

function activePool() {
  return databaseContext.getStore()?.pool || defaultPool;
}

const pool = new Proxy({}, {
  get(_target, property) {
    const currentPool = activePool();
    if (!currentPool) throw new Error('Database pool is not initialized.');
    const value = currentPool[property];
    return typeof value === 'function' ? value.bind(currentPool) : value;
  },
});

async function seedQuranPagesIfNeeded() {
  const [[existingAyahs]] = await pool.query('SELECT COUNT(*) AS count FROM quran_ayah_pages');
  const [[existingChapters]] = await pool.query('SELECT COUNT(*) AS count FROM quran_surahs');
  const [[existingTexts]] = await pool.query("SELECT COUNT(*) AS count FROM quran_ayah_pages WHERE text_uthmani IS NOT NULL AND text_uthmani <> ''");
  const metadataComplete = Number(existingAyahs.count || 0) >= 6236 && Number(existingChapters.count || 0) >= 114;
  if (metadataComplete && Number(existingTexts.count || 0) >= 6236) return;

  const dataUrl = new URL('./data/quran-pages.json', import.meta.url);
  const uthmaniUrl = new URL('./data/quran-uthmani.json', import.meta.url);
  const data = JSON.parse(await readFile(dataUrl, 'utf8'));
  const uthmaniData = JSON.parse(await readFile(uthmaniUrl, 'utf8'));
  const chapters = Array.isArray(data.chapters) ? data.chapters : [];
  const ayahs = Array.isArray(data.ayahs) ? data.ayahs : [];
  const uthmaniVerses = Array.isArray(uthmaniData.verses) ? uthmaniData.verses : [];
  const uthmaniByKey = new Map(uthmaniVerses.map((verse) => [String(verse.verse_key), String(verse.text_uthmani || '')]));
  if (chapters.length !== 114 || ayahs.length !== 6236 || uthmaniByKey.size !== 6236) {
    throw new Error('Quran page seed data is incomplete.');
  }

  if (!metadataComplete) {
    await pool.query('DELETE FROM quran_ayah_pages');
    await pool.query('DELETE FROM quran_surahs');

    for (let index = 0; index < chapters.length; index += 50) {
      const chunk = chapters.slice(index, index + 50);
      await pool.query(
        `
        INSERT INTO quran_surahs
          (surah_number, name_arabic, name_english, ayah_count, start_page, end_page)
        VALUES ?
        `,
        [chunk.map((chapter) => [
          chapter.number,
          chapter.name,
          chapter.englishName || '',
          chapter.ayahCount,
          chapter.startPage,
          chapter.endPage,
        ])]
      );
    }
  }

  for (let index = 0; index < ayahs.length; index += 500) {
    const chunk = ayahs.slice(index, index + 500);
    await pool.query(
      `
      INSERT INTO quran_ayah_pages
        (surah_number, surah_name, ayah_number, page_number, juz_number, text_uthmani)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        surah_name = VALUES(surah_name),
        page_number = VALUES(page_number),
        juz_number = VALUES(juz_number),
        text_uthmani = VALUES(text_uthmani)
      `,
      [chunk.map((ayah) => [
        ayah.surah,
        ayah.surahName,
        ayah.ayah,
        ayah.page,
        ayah.juz,
        uthmaniByKey.get(`${ayah.surah}:${ayah.ayah}`) || '',
      ])]
    );
  }
}

async function addColumnIfMissing(table, column, definition) {
  const [rows] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [activeDatabaseName(), table, column]
  );

  if (rows[0].count === 0) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function addIndexIfMissing(table, index, definition) {
  const [rows] = await pool.query(
    `
    SELECT COUNT(*) AS count
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = ?
      AND INDEX_NAME = ?
    `,
    [activeDatabaseName(), table, index]
  );

  if (rows[0].count === 0) {
    await pool.query(`ALTER TABLE ${table} ADD ${definition}`);
  }
}

async function modifyColumn(table, column, definition) {
  await pool.query(`ALTER TABLE ${table} MODIFY COLUMN ${column} ${definition}`);
}

async function syncStudentPointsFromTransactions() {
  await pool.query(`
    UPDATE students s
    LEFT JOIN (
      SELECT
        student_id,
        GREATEST(
          0,
          COALESCE(SUM(CASE WHEN transaction_type = 'increase' THEN points ELSE -points END), 0)
        ) AS ledger_points
      FROM student_point_transactions
      GROUP BY student_id
    ) t ON t.student_id = s.id
    SET s.points = COALESCE(t.ledger_points, 0)
  `);
}

async function backfillPointTransactionActors() {
  await pool.query(`
    UPDATE student_point_transactions t
    LEFT JOIN supervisors sp ON sp.id = t.supervisor_id
    SET
      t.actor_role = COALESCE(
        t.actor_role,
        CASE
          WHEN sp.id IS NOT NULL THEN 'supervisor'
          WHEN t.source_type IN ('manager_adjustment', 'manual_award') THEN 'manager'
          ELSE 'system'
        END
      ),
      t.actor_name = COALESCE(
        t.actor_name,
        sp.name,
        CASE
          WHEN t.source_type IN ('manager_adjustment', 'manual_award') THEN 'المدير'
          ELSE 'النظام'
        END
      )
    WHERE t.actor_name IS NULL OR t.actor_role IS NULL
  `);
}

async function initializeDatabase(databaseName, { seedDefaultData } = {}) {
  await evictIdleDatabasePools({ reserveSlot: true });
  const bootstrap = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
  });

  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await bootstrap.end();
  }

  const initializedPool = instrumentDatabase(mysql.createPool({ ...config, database: databaseName }), databaseName, { pool: true });
  databasePools.set(databaseName, initializedPool);
  touchDatabasePool(databaseName);
  if (databaseName === defaultDatabaseName) defaultPool = initializedPool;

  await databaseContext.run({ databaseName, pool: initializedPool }, async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(80) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS committees (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      points DECIMAL(12,2) NOT NULL DEFAULT 0,
      leader_name VARCHAR(180) NULL,
      leader_login_number VARCHAR(80) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('committees', 'leader_name', 'VARCHAR(180) NULL');
  await addColumnIfMissing('committees', 'points', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing('committees', 'student_points_contribution', 'DECIMAL(12,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing('committees', 'leader_login_number', 'VARCHAR(80) NULL');
  await addColumnIfMissing('committees', 'leader_as_student', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('committees', 'leader_student_id', 'BIGINT UNSIGNED NULL');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      login_number VARCHAR(80) NOT NULL UNIQUE,
      national_id VARCHAR(40) NOT NULL,
      guardian_phone VARCHAR(40) NOT NULL,
      age INT UNSIGNED NULL,
      committee_id BIGINT UNSIGNED NULL,
      points DECIMAL(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT students_committee_id_fk
        FOREIGN KEY (committee_id) REFERENCES committees(id)
        ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await modifyColumn('students', 'committee_id', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing('students', 'age', 'INT UNSIGNED NULL AFTER guardian_phone');
  await addColumnIfMissing('students', 'store_balance', 'DECIMAL(12,2) NULL AFTER points');
  await addColumnIfMissing('students', 'last_login_at', 'TIMESTAMP NULL AFTER store_balance');
  await addIndexIfMissing('students', 'students_created_lookup', 'INDEX students_created_lookup (created_at)');
  await addIndexIfMissing('students', 'students_last_login_lookup', 'INDEX students_last_login_lookup (last_login_at)');
  await pool.query('UPDATE students SET store_balance = points WHERE store_balance IS NULL');
  await modifyColumn('students', 'store_balance', 'DECIMAL(12,2) NOT NULL DEFAULT 0');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_achievements (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(40) NOT NULL,
      title VARCHAR(180) NOT NULL,
      supervisor_name VARCHAR(180) NULL,
      achieved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT achievements_student_id_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_achievements (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      family_id BIGINT UNSIGNED NOT NULL,
      type VARCHAR(40) NOT NULL,
      title VARCHAR(180) NOT NULL,
      supervisor_name VARCHAR(180) NULL,
      points INT NOT NULL DEFAULT 0,
      achieved_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT family_achievements_family_id_fk
        FOREIGN KEY (family_id) REFERENCES committees(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing('family_achievements', 'points', 'INT NOT NULL DEFAULT 0');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS registration_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      guardian_phone VARCHAR(40) NOT NULL,
      national_id VARCHAR(40) NOT NULL,
      age INT UNSIGNED NOT NULL,
      memorization_json JSON NOT NULL,
      test_results_json JSON NULL,
      preliminary_sent_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX registration_requests_created_lookup (created_at),
      INDEX registration_requests_national_lookup (national_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NULL,
      registration_request_id BIGINT UNSIGNED NULL,
      guardian_phone VARCHAR(40) NOT NULL,
      message TEXT NOT NULL,
      status ENUM('prepared', 'sent', 'failed') NOT NULL DEFAULT 'prepared',
      failure_reason VARCHAR(500) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT whatsapp_messages_student_id_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX whatsapp_messages_student_lookup (student_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await modifyColumn('whatsapp_messages', 'student_id', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing('whatsapp_messages', 'registration_request_id', 'BIGINT UNSIGNED NULL AFTER student_id');
  await addColumnIfMissing('whatsapp_messages', 'failure_reason', 'VARCHAR(500) NULL');
  await addColumnIfMissing('whatsapp_messages', 'message_type', 'VARCHAR(80) NULL AFTER failure_reason');
  await addIndexIfMissing('whatsapp_messages', 'whatsapp_messages_type_lookup', 'INDEX whatsapp_messages_type_lookup (message_type, student_id, created_at)');
  await addIndexIfMissing('whatsapp_messages', 'whatsapp_messages_registration_lookup', 'INDEX whatsapp_messages_registration_lookup (registration_request_id, created_at)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_role ENUM('student', 'supervisor') NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      endpoint VARCHAR(700) NOT NULL UNIQUE,
      subscription_json JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX push_subscriptions_user_lookup (user_role, user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_notifications (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      body TEXT NOT NULL,
      recipient_type ENUM('all', 'students', 'staff', 'specific') NOT NULL,
      created_by_role VARCHAR(40) NOT NULL,
      created_by_id BIGINT UNSIGNED NULL,
      created_by_name VARCHAR(180) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX app_notifications_created_lookup (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing('app_notifications', 'dedupe_key', 'VARCHAR(220) NULL AFTER body');
  await addIndexIfMissing('app_notifications', 'app_notifications_dedupe_unique', 'UNIQUE INDEX app_notifications_dedupe_unique (dedupe_key)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_notification_recipients (
      notification_id BIGINT UNSIGNED NOT NULL,
      user_role VARCHAR(40) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      body_override TEXT NULL,
      read_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (notification_id, user_role, user_id),
      INDEX app_notification_recipients_user_lookup (user_role, user_id, read_at, created_at),
      CONSTRAINT app_notification_recipients_notification_fk
        FOREIGN KEY (notification_id) REFERENCES app_notifications(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_deletion_requests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_role ENUM('student', 'supervisor', 'admin', 'reciter', 'manager') NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      user_name VARCHAR(180) NOT NULL,
      status ENUM('pending', 'cancelled', 'completed', 'rejected') NOT NULL DEFAULT 'pending',
      manager_note VARCHAR(500) NULL,
      requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY account_deletion_user_unique (user_role, user_id),
      INDEX account_deletion_status_lookup (status, requested_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await modifyColumn('account_deletion_requests', 'user_role', "ENUM('student', 'supervisor', 'admin', 'reciter', 'manager') NOT NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      sender_role VARCHAR(40) NULL,
      sender_id BIGINT UNSIGNED NULL,
      sender_name VARCHAR(180) NOT NULL,
      subject TEXT NOT NULL,
      status ENUM('pending', 'replied') NOT NULL DEFAULT 'pending',
      reply TEXT NULL,
      replied_by_role VARCHAR(40) NULL,
      replied_by_id BIGINT UNSIGNED NULL,
      replied_by_name VARCHAR(180) NULL,
      replied_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX contact_messages_status_lookup (status, created_at),
      INDEX contact_messages_sender_lookup (sender_role, sender_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attendance_records (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      record_date DATE NOT NULL,
      status ENUM('present', 'late', 'absent', 'excused') NOT NULL,
      check_in_time TIME NULL,
      points INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT attendance_student_id_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      UNIQUE KEY attendance_student_date_unique (student_id, record_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('attendance_records', 'check_in_time', 'TIME NULL');
  await modifyColumn('attendance_records', 'status', "ENUM('present', 'late', 'absent', 'excused') NOT NULL");
  await addIndexIfMissing('attendance_records', 'attendance_date_status_lookup', 'INDEX attendance_date_status_lookup (record_date, status, student_id)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_leader_accounts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      family_id BIGINT UNSIGNED NOT NULL UNIQUE,
      name VARCHAR(180) NOT NULL,
      login_number VARCHAR(80) NOT NULL UNIQUE,
      role VARCHAR(40) NOT NULL DEFAULT 'family_leader',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT family_leader_accounts_family_id_fk
        FOREIGN KEY (family_id) REFERENCES committees(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supervisors (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      login_number VARCHAR(80) NOT NULL UNIQUE,
      national_id VARCHAR(40) NOT NULL,
      phone VARCHAR(40) NOT NULL,
      job_title VARCHAR(120) NOT NULL,
      role VARCHAR(40) NOT NULL DEFAULT 'supervisor',
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await modifyColumn('supervisors', 'role', "VARCHAR(40) NOT NULL DEFAULT 'supervisor'");
  await addColumnIfMissing('supervisors', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER role');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supervisor_dashboard_permissions (
      supervisor_id BIGINT UNSIGNED NOT NULL,
      permission_key VARCHAR(80) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (supervisor_id, permission_key),
      CONSTRAINT supervisor_dashboard_permissions_supervisor_id_fk
        FOREIGN KEY (supervisor_id) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supervisor_attendance_records (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      supervisor_id BIGINT UNSIGNED NOT NULL,
      record_date DATE NOT NULL,
      status ENUM('present', 'late', 'absent', 'excused') NOT NULL,
      check_in_time TIME NULL,
      points INT NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT supervisor_attendance_supervisor_id_fk
        FOREIGN KEY (supervisor_id) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      UNIQUE KEY supervisor_attendance_date_unique (supervisor_id, record_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing('supervisor_attendance_records', 'points', 'INT NOT NULL DEFAULT 0');
  await modifyColumn('supervisor_attendance_records', 'status', "ENUM('present', 'late', 'absent', 'excused') NOT NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(120) NOT NULL PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query('ALTER TABLE app_settings MODIFY setting_value TEXT NOT NULL');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS backup_runs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      status ENUM('running', 'completed', 'failed') NOT NULL,
      trigger_type ENUM('manual', 'scheduled') NOT NULL,
      actor_name VARCHAR(160) NOT NULL DEFAULT 'النظام',
      file_name VARCHAR(255) NULL,
      size_bytes BIGINT UNSIGNED NULL,
      checksum_sha256 CHAR(64) NULL,
      storage_targets JSON NULL,
      retention_tiers JSON NULL,
      error_message VARCHAR(1000) NULL,
      started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL,
      INDEX backup_runs_started_at_idx (started_at),
      INDEX backup_runs_status_idx (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing('backup_runs', 'retention_tiers', 'JSON NULL AFTER storage_targets');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quran_surahs (
      surah_number INT NOT NULL PRIMARY KEY,
      name_arabic VARCHAR(80) NOT NULL,
      name_english VARCHAR(120) NOT NULL,
      ayah_count INT NOT NULL,
      start_page INT NOT NULL,
      end_page INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quran_ayah_pages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      surah_number INT NOT NULL,
      surah_name VARCHAR(80) NOT NULL,
      ayah_number INT NOT NULL,
      page_number INT NOT NULL,
      juz_number INT NOT NULL,
      text_uthmani TEXT NULL,
      UNIQUE KEY quran_ayah_unique (surah_number, ayah_number),
      INDEX quran_page_lookup (page_number),
      INDEX quran_surah_lookup (surah_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing('quran_ayah_pages', 'text_uthmani', 'TEXT NULL AFTER juz_number');

  await seedQuranPagesIfNeeded();

  const correctedSabaName = '\u0633\u0628\u0623';
  await pool.query(
    'UPDATE quran_surahs SET name_arabic = ? WHERE surah_number = 34 AND name_arabic <> ?',
    [correctedSabaName, correctedSabaName]
  );

  await pool.query(
    'UPDATE quran_ayah_pages SET surah_name = ? WHERE surah_number = 34 AND surah_name <> ?',
    [correctedSabaName, correctedSabaName]
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supervisor_committees (
      supervisor_id BIGINT UNSIGNED NOT NULL,
      committee_id BIGINT UNSIGNED NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (supervisor_id, committee_id),
      CONSTRAINT supervisor_committees_supervisor_fk
        FOREIGN KEY (supervisor_id) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT supervisor_committees_committee_fk
        FOREIGN KEY (committee_id) REFERENCES committees(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_rooms (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      livekit_room_name VARCHAR(180) NOT NULL UNIQUE,
      committee_id BIGINT UNSIGNED NOT NULL,
      status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
      created_by_role ENUM('manager', 'admin', 'supervisor') NOT NULL,
      created_by_id BIGINT UNSIGNED NULL,
      created_by_name VARCHAR(180) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP NULL,
      CONSTRAINT call_rooms_committee_fk
        FOREIGN KEY (committee_id) REFERENCES committees(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
      INDEX call_rooms_status_committee_lookup (status, committee_id),
      INDEX call_rooms_creator_lookup (created_by_role, created_by_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS call_room_participants (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      room_id BIGINT UNSIGNED NOT NULL,
      user_role ENUM('manager', 'admin', 'supervisor', 'student') NOT NULL,
      user_id BIGINT UNSIGNED NULL,
      user_name VARCHAR(180) NOT NULL,
      join_count INT UNSIGNED NOT NULL DEFAULT 1,
      first_joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_left_at TIMESTAMP NULL,
      CONSTRAINT call_room_participants_room_fk
        FOREIGN KEY (room_id) REFERENCES call_rooms(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      UNIQUE KEY call_room_participant_unique (room_id, user_role, user_id),
      INDEX call_room_participant_room_lookup (room_id, last_joined_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS narration_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      scope ENUM('all', 'committee') NOT NULL DEFAULT 'all',
      committee_id BIGINT UNSIGNED NULL,
      status ENUM('open', 'archived') NOT NULL DEFAULT 'open',
      created_by_role VARCHAR(40) NOT NULL,
      created_by_id BIGINT UNSIGNED NULL,
      created_by_name VARCHAR(180) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      archived_at TIMESTAMP NULL,
      CONSTRAINT narration_events_committee_fk
        FOREIGN KEY (committee_id) REFERENCES committees(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
      INDEX narration_events_status_date (status, start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS narration_event_students (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      student_id BIGINT UNSIGNED NOT NULL,
      student_name VARCHAR(180) NOT NULL,
      committee_id BIGINT UNSIGNED NULL,
      committee_name VARCHAR(180) NULL,
      status ENUM('pending', 'in_progress', 'completed', 'absent', 'excused') NOT NULL DEFAULT 'pending',
      total_faces DECIMAL(8,2) NOT NULL DEFAULT 0,
      final_score DECIMAL(7,2) NULL,
      final_rating VARCHAR(80) NULL,
      archived_at TIMESTAMP NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT narration_students_event_fk
        FOREIGN KEY (event_id) REFERENCES narration_events(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      UNIQUE KEY narration_event_student_unique (event_id, student_id),
      INDEX narration_students_status_lookup (event_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing('narration_event_students', 'archived_at', 'TIMESTAMP NULL AFTER final_rating');
  await addIndexIfMissing(
    'narration_event_students',
    'narration_students_archive_lookup',
    'INDEX narration_students_archive_lookup (event_id, archived_at, committee_id)'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS narration_event_parts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      event_student_id BIGINT UNSIGNED NOT NULL,
      juz_number TINYINT UNSIGNED NOT NULL,
      start_surah INT NOT NULL,
      start_ayah INT NOT NULL,
      start_page INT NOT NULL,
      end_surah INT NOT NULL,
      end_ayah INT NOT NULL,
      end_page INT NOT NULL,
      faces DECIMAL(8,2) NOT NULL DEFAULT 0,
      warning_count INT NOT NULL DEFAULT 0,
      hesitation_count INT NOT NULL DEFAULT 0,
      mistake_count INT NOT NULL DEFAULT 0,
      score DECIMAL(7,2) NULL,
      notes VARCHAR(500) NULL,
      evaluated_by BIGINT UNSIGNED NULL,
      evaluated_at TIMESTAMP NULL,
      evaluation_mode VARCHAR(20) NOT NULL DEFAULT 'count',
      word_marks_json JSON NULL,
      CONSTRAINT narration_parts_student_fk
        FOREIGN KEY (event_student_id) REFERENCES narration_event_students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX narration_parts_student_lookup (event_student_id, juz_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing('narration_event_parts', 'evaluation_mode', "VARCHAR(20) NOT NULL DEFAULT 'count' AFTER evaluated_at");
  await addColumnIfMissing('narration_event_parts', 'word_marks_json', 'JSON NULL AFTER evaluation_mode');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_quran_plans (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      status ENUM('active', 'completed', 'paused') NOT NULL DEFAULT 'active',
      track ENUM('memorization', 'mastery') NOT NULL DEFAULT 'memorization',
      start_surah INT NOT NULL,
      start_ayah INT NOT NULL,
      start_page INT NOT NULL,
      end_surah INT NOT NULL,
      end_ayah INT NOT NULL,
      end_page INT NOT NULL,
      daily_pages DECIMAL(7,2) NOT NULL DEFAULT 1,
      link_pages INT NOT NULL DEFAULT 10,
      review_pages INT NOT NULL DEFAULT 20,
      review_split_weekly TINYINT(1) NOT NULL DEFAULT 0,
      review_week_start_day TINYINT UNSIGNED NOT NULL DEFAULT 0,
      review_week_end_day TINYINT UNSIGNED NOT NULL DEFAULT 6,
      review_min_daily_pages INT NOT NULL DEFAULT 1,
      next_memorization_page INT NOT NULL,
      next_memorization_surah INT NULL,
      next_memorization_ayah INT NULL,
      next_review_page INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT student_quran_plans_student_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX student_quran_plan_status_lookup (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing('student_quran_plans', 'track', "ENUM('memorization', 'mastery') NOT NULL DEFAULT 'memorization' AFTER status");
  await addColumnIfMissing('student_quran_plans', 'start_date', 'DATE NULL AFTER status');
  await addColumnIfMissing('student_quran_plans', 'target_end_date', 'DATE NULL AFTER start_date');
  await modifyColumn('student_quran_plans', 'daily_pages', 'DECIMAL(7,2) NOT NULL DEFAULT 1');
  await addColumnIfMissing('student_quran_plans', 'review_split_weekly', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addColumnIfMissing('student_quran_plans', 'review_week_start_day', 'TINYINT UNSIGNED NOT NULL DEFAULT 0');
  await addColumnIfMissing('student_quran_plans', 'review_week_end_day', 'TINYINT UNSIGNED NOT NULL DEFAULT 6');
  await addColumnIfMissing('student_quran_plans', 'review_min_daily_pages', 'INT NOT NULL DEFAULT 1');
  await addColumnIfMissing('student_quran_plans', 'next_memorization_surah', 'INT NULL AFTER next_memorization_page');
  await addColumnIfMissing('student_quran_plans', 'next_memorization_ayah', 'INT NULL AFTER next_memorization_surah');
  await addColumnIfMissing('student_quran_plans', 'previous_plan_id', 'BIGINT UNSIGNED NULL AFTER student_id');
  await addColumnIfMissing('student_quran_plans', 'effective_from', 'DATE NULL AFTER target_end_date');
  await addColumnIfMissing('student_quran_plans', 'schedule_days_json', 'JSON NULL AFTER effective_from');
  await addColumnIfMissing('student_quran_plans', 'schedule_anchor_page', 'INT NULL AFTER schedule_days_json');
  await addColumnIfMissing('student_quran_plans', 'schedule_anchor_surah', 'INT NULL AFTER schedule_anchor_page');
  await addColumnIfMissing('student_quran_plans', 'schedule_anchor_ayah', 'INT NULL AFTER schedule_anchor_surah');
  await addIndexIfMissing('student_quran_plans', 'student_quran_plans_created_status_lookup', 'INDEX student_quran_plans_created_status_lookup (created_at, status)');
  await addIndexIfMissing('student_quran_plans', 'student_quran_plans_schedule_lookup', 'INDEX student_quran_plans_schedule_lookup (status, start_date, target_end_date)');
  await addIndexIfMissing('student_quran_plans', 'student_quran_plans_previous_lookup', 'INDEX student_quran_plans_previous_lookup (previous_plan_id, effective_from)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_quran_plan_prior_memorization (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      plan_id BIGINT UNSIGNED NOT NULL,
      student_id BIGINT UNSIGNED NOT NULL,
      start_surah INT NOT NULL,
      start_ayah INT NOT NULL,
      start_page INT NOT NULL,
      end_surah INT NOT NULL,
      end_ayah INT NOT NULL,
      end_page INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT prior_memorization_plan_fk
        FOREIGN KEY (plan_id) REFERENCES student_quran_plans(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT prior_memorization_student_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX prior_memorization_plan_lookup (plan_id),
      INDEX prior_memorization_student_lookup (student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_quran_prior_memorization (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      source VARCHAR(40) NOT NULL DEFAULT 'registration',
      start_surah INT NOT NULL,
      start_ayah INT NOT NULL,
      start_page INT NOT NULL,
      end_surah INT NOT NULL,
      end_ayah INT NOT NULL,
      end_page INT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT standalone_prior_memorization_student_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX standalone_prior_memorization_student_lookup (student_id),
      INDEX standalone_prior_memorization_source_lookup (source)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_quran_tasks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      plan_id BIGINT UNSIGNED NOT NULL,
      student_id BIGINT UNSIGNED NOT NULL,
      task_date DATE NOT NULL,
      task_type ENUM('memorization', 'review', 'link', 'repeat') NOT NULL,
      track ENUM('memorization', 'mastery') NOT NULL DEFAULT 'memorization',
      from_page INT NOT NULL,
      to_page INT NOT NULL,
      from_surah INT NULL,
      from_ayah INT NULL,
      to_surah INT NULL,
      to_ayah INT NULL,
      target_pages DECIMAL(7,2) NULL,
      actual_to_page INT NULL,
      actual_to_surah INT NULL,
      actual_to_ayah INT NULL,
      execution_state ENUM('complete', 'partial', 'extra') NULL,
      student_status ENUM('pending', 'done', 'not_done') NOT NULL DEFAULT 'pending',
      teacher_rating_key VARCHAR(80) NULL,
      teacher_rating_label VARCHAR(120) NULL,
      warning_count INT NOT NULL DEFAULT 0,
      hesitation_count INT NOT NULL DEFAULT 0,
      mistake_count INT NOT NULL DEFAULT 0,
      evaluation_score DECIMAL(7,2) NULL,
      points INT NOT NULL DEFAULT 0,
      teacher_completed TINYINT(1) NULL,
      evaluated_by BIGINT UNSIGNED NULL,
      evaluated_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT student_quran_tasks_plan_fk
        FOREIGN KEY (plan_id) REFERENCES student_quran_plans(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT student_quran_tasks_student_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT student_quran_tasks_supervisor_fk
        FOREIGN KEY (evaluated_by) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      UNIQUE KEY student_quran_task_unique (plan_id, task_date, task_type, from_page, to_page),
      INDEX student_quran_tasks_student_date (student_id, task_date),
      INDEX student_quran_tasks_eval_lookup (teacher_completed, task_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await modifyColumn('student_quran_tasks', 'task_type', "ENUM('memorization', 'review', 'link', 'repeat') NOT NULL");
  await addColumnIfMissing('student_quran_tasks', 'track', "ENUM('memorization', 'mastery') NOT NULL DEFAULT 'memorization' AFTER task_type");
  await addColumnIfMissing('student_quran_tasks', 'target_pages', 'DECIMAL(7,2) NULL');
  await modifyColumn('student_quran_tasks', 'target_pages', 'DECIMAL(7,2) NULL');
  const taskColumns = {
    from_surah: 'INT NULL AFTER to_page',
    from_ayah: 'INT NULL AFTER from_surah',
    to_surah: 'INT NULL AFTER from_ayah',
    to_ayah: 'INT NULL AFTER to_surah',
    actual_to_page: 'INT NULL AFTER target_pages',
    actual_to_surah: 'INT NULL AFTER actual_to_page',
    actual_to_ayah: 'INT NULL AFTER actual_to_surah',
    execution_state: "ENUM('complete', 'partial', 'extra') NULL AFTER actual_to_ayah",
    teacher_rating_key: 'VARCHAR(80) NULL AFTER student_status',
    teacher_rating_label: 'VARCHAR(120) NULL AFTER teacher_rating_key',
    warning_count: 'INT NOT NULL DEFAULT 0 AFTER teacher_rating_label',
    mistake_count: 'INT NOT NULL DEFAULT 0 AFTER warning_count',
    evaluation_score: 'DECIMAL(7,2) NULL AFTER mistake_count',
    evaluation_max_score: 'DECIMAL(7,2) NULL AFTER evaluation_score',
    evaluation_warning_deduction: 'DECIMAL(7,2) NULL AFTER evaluation_max_score',
    evaluation_mistake_deduction: 'DECIMAL(7,2) NULL AFTER evaluation_warning_deduction',
    evaluation_passing_score: 'DECIMAL(7,2) NULL AFTER evaluation_mistake_deduction',
    points: 'INT NOT NULL DEFAULT 0 AFTER evaluation_score',
    teacher_completed: 'TINYINT(1) NULL AFTER points',
    evaluated_by: 'BIGINT UNSIGNED NULL AFTER teacher_completed',
    evaluated_at: 'TIMESTAMP NULL AFTER evaluated_by',
    actual_repeat_count: 'INT NULL AFTER execution_state',
    actual_listening_count: 'INT NULL AFTER actual_repeat_count',
    normal_to_page: 'INT NULL AFTER target_pages',
    normal_to_surah: 'INT NULL AFTER normal_to_page',
    normal_to_ayah: 'INT NULL AFTER normal_to_surah',
    scheduled_to_page: 'INT NULL AFTER normal_to_ayah',
    scheduled_to_surah: 'INT NULL AFTER scheduled_to_page',
    scheduled_to_ayah: 'INT NULL AFTER scheduled_to_surah',
  };
  for (const [column, definition] of Object.entries(taskColumns)) {
    await addColumnIfMissing('student_quran_tasks', column, definition);
  }
  await addIndexIfMissing('student_quran_tasks', 'student_quran_tasks_date_status_lookup', 'INDEX student_quran_tasks_date_status_lookup (task_date, student_status, task_type, student_id)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quran_plan_user_preferences (
      actor_role VARCHAR(40) NOT NULL,
      actor_id BIGINT UNSIGNED NOT NULL,
      last_start_date DATE NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (actor_role, actor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_quran_execution_segments (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      plan_id BIGINT UNSIGNED NOT NULL,
      student_id BIGINT UNSIGNED NOT NULL,
      task_date DATE NOT NULL,
      task_type ENUM('memorization', 'mastery') NOT NULL,
      source_type ENUM('student', 'teacher') NOT NULL,
      source_id BIGINT UNSIGNED NULL,
      segment_type ENUM('normal', 'compensation', 'extra') NOT NULL,
      from_page INT NOT NULL,
      from_surah INT NOT NULL,
      from_ayah INT NOT NULL,
      to_page INT NOT NULL,
      to_surah INT NOT NULL,
      to_ayah INT NOT NULL,
      amount_faces DECIMAL(9,2) NOT NULL DEFAULT 0,
      points_percent DECIMAL(7,2) NOT NULL DEFAULT 100,
      points_awarded DECIMAL(11,2) NOT NULL DEFAULT 0,
      is_current TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT quran_execution_segments_plan_fk
        FOREIGN KEY (plan_id) REFERENCES student_quran_plans(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT quran_execution_segments_student_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX quran_execution_segments_report_lookup (student_id, task_date, segment_type, is_current),
      INDEX quran_execution_segments_source_lookup (source_type, source_id, is_current)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_quran_recitation_attempts (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      task_id BIGINT UNSIGNED NOT NULL,
      student_id BIGINT UNSIGNED NOT NULL,
      evaluator_id BIGINT UNSIGNED NULL,
      session_date DATE NOT NULL,
      attempt_number INT UNSIGNED NOT NULL,
      request_id VARCHAR(80) NULL,
      warning_count INT NOT NULL DEFAULT 0,
      hesitation_count INT NOT NULL DEFAULT 0,
      mistake_count INT NOT NULL DEFAULT 0,
      evaluation_score DECIMAL(7,2) NULL,
      evaluation_max_score DECIMAL(7,2) NULL,
      evaluation_warning_deduction DECIMAL(7,2) NULL,
      evaluation_hesitation_deduction DECIMAL(7,2) NULL,
      evaluation_mistake_deduction DECIMAL(7,2) NULL,
      evaluation_passing_score DECIMAL(7,2) NULL,
      teacher_completed TINYINT(1) NOT NULL,
      ayah_marks_json JSON NULL,
      word_marks_json JSON NULL,
      evaluated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT quran_recitation_attempt_task_fk
        FOREIGN KEY (task_id) REFERENCES student_quran_tasks(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT quran_recitation_attempt_student_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT quran_recitation_attempt_evaluator_fk
        FOREIGN KEY (evaluator_id) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      UNIQUE KEY quran_recitation_attempt_number_unique (task_id, attempt_number),
      UNIQUE KEY quran_recitation_attempt_request_unique (task_id, request_id),
      INDEX quran_recitation_attempt_report_lookup (session_date, student_id, evaluator_id),
      INDEX quran_recitation_attempt_latest_lookup (task_id, evaluated_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    INSERT INTO student_quran_recitation_attempts
      (
        task_id, student_id, evaluator_id, session_date, attempt_number,
        warning_count, mistake_count, evaluation_score, evaluation_max_score,
        evaluation_warning_deduction, evaluation_mistake_deduction,
        evaluation_passing_score, teacher_completed, evaluated_at
      )
    SELECT
      t.id, t.student_id, t.evaluated_by, DATE(COALESCE(t.evaluated_at, t.task_date)), 1,
      t.warning_count, t.mistake_count, t.evaluation_score, t.evaluation_max_score,
      t.evaluation_warning_deduction, t.evaluation_mistake_deduction,
      t.evaluation_passing_score, t.teacher_completed, COALESCE(t.evaluated_at, t.updated_at)
    FROM student_quran_tasks t
    WHERE t.teacher_completed IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM student_quran_recitation_attempts a WHERE a.task_id = t.id
      )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_products (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(180) NOT NULL,
      description VARCHAR(500) NULL,
      image_data LONGTEXT NOT NULL,
      points_price INT NOT NULL,
      stock INT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      deleted_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX store_products_active_lookup (is_active, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS store_orders (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      product_id BIGINT UNSIGNED NOT NULL,
      product_name VARCHAR(180) NOT NULL,
      points_price INT NOT NULL,
      order_date DATE NULL,
      request_id CHAR(36) NULL,
      fulfilled_at TIMESTAMP NULL,
      rejected_at TIMESTAMP NULL,
      stock_reserved TINYINT(1) NULL,
      fulfilled_by_role VARCHAR(40) NULL,
      fulfilled_by_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT store_orders_student_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT store_orders_product_fk
        FOREIGN KEY (product_id) REFERENCES store_products(id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
      INDEX store_orders_pending_lookup (fulfilled_at, created_at),
      INDEX store_orders_student_lookup (student_id, created_at),
      UNIQUE KEY store_orders_request_unique (request_id),
      KEY store_orders_student_date (student_id, order_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_quran_task_ayah_marks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      task_id BIGINT UNSIGNED NOT NULL,
      surah_number INT NOT NULL,
      ayah_number INT NOT NULL,
      ayah_text TEXT NOT NULL,
      mark_type ENUM('mistake', 'warning') NOT NULL,
      occurrence_count INT NOT NULL DEFAULT 1,
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT quran_task_ayah_marks_task_fk
        FOREIGN KEY (task_id) REFERENCES student_quran_tasks(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      UNIQUE KEY quran_task_ayah_mark_unique (task_id, surah_number, ayah_number, mark_type),
      INDEX quran_task_ayah_marks_task_lookup (task_id, mark_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_quran_task_word_marks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      task_id BIGINT UNSIGNED NOT NULL,
      page_number INT NOT NULL,
      start_surah INT NOT NULL,
      start_ayah INT NOT NULL,
      start_word_position INT NOT NULL,
      end_surah INT NOT NULL,
      end_ayah INT NOT NULL,
      end_word_position INT NOT NULL,
      selected_text VARCHAR(1000) NOT NULL,
      mark_type ENUM('mistake', 'warning', 'lahn') NOT NULL,
      notes VARCHAR(500) NULL,
      evaluation_mode VARCHAR(20) NOT NULL DEFAULT 'count',
      word_marks_json JSON NULL,
      created_by BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT quran_task_word_marks_task_fk
        FOREIGN KEY (task_id) REFERENCES student_quran_tasks(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX quran_task_word_marks_task_lookup (task_id, mark_type),
      INDEX quran_task_word_marks_page_lookup (page_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    UPDATE student_quran_recitation_attempts a
    SET a.ayah_marks_json = COALESCE(
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'surah', w.start_surah,
          'ayah', w.start_ayah,
          'selectedText', w.selected_text,
          'markType', w.mark_type,
          'notes', w.notes
        ))
        FROM student_quran_task_word_marks w
        WHERE w.task_id = a.task_id
      ),
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'surah', m.surah_number,
          'ayah', m.ayah_number,
          'textUthmani', m.ayah_text,
          'markType', m.mark_type,
          'occurrenceCount', m.occurrence_count
        ))
        FROM student_quran_task_ayah_marks m
        WHERE m.task_id = a.task_id
      ),
      JSON_ARRAY()
    )
    WHERE a.ayah_marks_json IS NULL
  `);
  await pool.query(`
    UPDATE student_quran_recitation_attempts a
    SET a.word_marks_json = COALESCE(
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT(
          'page', w.page_number,
          'startSurah', w.start_surah,
          'startAyah', w.start_ayah,
          'startWordPosition', w.start_word_position,
          'endSurah', w.end_surah,
          'endAyah', w.end_ayah,
          'endWordPosition', w.end_word_position,
          'selectedText', w.selected_text,
          'markType', w.mark_type,
          'notes', w.notes
        ))
        FROM student_quran_task_word_marks w
        WHERE w.task_id = a.task_id
      ),
      JSON_ARRAY()
    )
    WHERE a.word_marks_json IS NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_quran_tests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      juz_number TINYINT UNSIGNED NOT NULL,
      scheduled_date DATE NULL,
      status ENUM('scheduled', 'passed', 'failed') NOT NULL DEFAULT 'scheduled',
      warnings_count INT NOT NULL DEFAULT 0,
      mistakes_count INT NOT NULL DEFAULT 0,
      score DECIMAL(7,2) NULL,
      tested_by BIGINT UNSIGNED NULL,
      tested_at TIMESTAMP NULL,
      notes VARCHAR(500) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT student_quran_tests_student_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT student_quran_tests_supervisor_fk
        FOREIGN KEY (tested_by) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      INDEX student_quran_tests_student_lookup (student_id, juz_number, status),
      INDEX student_quran_tests_schedule_lookup (scheduled_date, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnIfMissing('student_quran_tests', 'scheduled_date', 'DATE NULL AFTER juz_number');
  await addColumnIfMissing('student_quran_tests', 'notes', 'VARCHAR(500) NULL AFTER tested_at');
  await addColumnIfMissing('student_quran_tests', 'evaluation_mode', "VARCHAR(20) NOT NULL DEFAULT 'count' AFTER notes");
  await addColumnIfMissing('student_quran_tests', 'word_marks_json', 'JSON NULL AFTER evaluation_mode');
  await addColumnIfMissing('student_quran_tests', 'sample_pages_json', 'JSON NULL AFTER word_marks_json');
  await addIndexIfMissing('student_quran_tests', 'student_quran_tests_tested_lookup', 'INDEX student_quran_tests_tested_lookup (tested_at, status, juz_number)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS report_archives (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      period_from DATE NOT NULL,
      period_to DATE NOT NULL,
      progress_report_json JSON NOT NULL,
      overview_report_json JSON NOT NULL,
      created_by_role VARCHAR(40) NULL,
      created_by_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX report_archives_period_lookup (period_from, period_to),
      INDEX report_archives_created_lookup (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      actor_role VARCHAR(40) NOT NULL DEFAULT 'system',
      actor_id BIGINT UNSIGNED NULL,
      actor_name VARCHAR(180) NOT NULL DEFAULT 'النظام',
      action VARCHAR(180) NOT NULL,
      entity_type VARCHAR(80) NULL,
      entity_id VARCHAR(80) NULL,
      details_json JSON NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX activity_logs_date_lookup (created_at),
      INDEX activity_logs_actor_lookup (actor_role, actor_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(`
    DELETE FROM activity_logs
    WHERE action IN ('تسجيل دخول', 'تسجيل خروج', 'إرسال إشعارات')
      OR entity_type IN ('notification', 'account')
  `);
  await pool.query(`
    DELETE newer
    FROM activity_logs newer
    JOIN activity_logs older
      ON older.action = newer.action
      AND COALESCE(older.entity_type, '') = COALESCE(newer.entity_type, '')
      AND COALESCE(older.entity_id, '') = COALESCE(newer.entity_id, '')
      AND older.created_at = newer.created_at
      AND COALESCE(CAST(older.details_json AS CHAR), '') = COALESCE(CAST(newer.details_json AS CHAR), '')
      AND older.id < newer.id
    WHERE newer.action IN (
      'تسجيل حضور طالب',
      'تسجيل غياب طالب',
      'تسجيل حضور مشرف المسار',
      'تسجيل غياب مشرف المسار'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      token_hash CHAR(64) NOT NULL UNIQUE,
      user_role ENUM('manager', 'admin', 'supervisor', 'reciter', 'student') NOT NULL,
      user_id BIGINT UNSIGNED NULL,
      user_name VARCHAR(180) NOT NULL,
      expires_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX auth_sessions_expiry_lookup (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await modifyColumn('auth_sessions', 'user_role', "ENUM('manager', 'admin', 'supervisor', 'reciter', 'student') NOT NULL");
  await pool.query(`
    UPDATE students s
    JOIN (
      SELECT user_id, MAX(created_at) AS lastLoginAt
      FROM auth_sessions
      WHERE user_role = 'student' AND user_id IS NOT NULL
      GROUP BY user_id
    ) sessions ON sessions.user_id = s.id
    SET s.last_login_at = COALESCE(s.last_login_at, sessions.lastLoginAt)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      attempt_key CHAR(64) NOT NULL PRIMARY KEY,
      failures TINYINT UNSIGNED NOT NULL DEFAULT 0,
      blocked_until DATETIME NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX login_attempts_cleanup_lookup (updated_at),
      INDEX login_attempts_block_lookup (blocked_until)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(
    `
    INSERT IGNORE INTO app_settings (setting_key, setting_value)
    VALUES
      ('maxSupervisorStudentPoints', '10'),
      ('maxDailyStudentPoints', '0'),
      ('maxSupervisorDeductionPoints', '10'),
      ('familyPointsAddToStudents', 'true'),
      ('familyPointsAddToAbsentStudents', 'true'),
      ('studentPointsAddToFamily', 'true'),
      ('familyEvaluationScope', 'program_supervisor'),
      ('activityLogEnabled', 'false'),
      ('rankingsVisible', 'true'),
      ('familyRankingMode', 'total'),
      ('rankingPointsVisible', 'true'),
      ('maxStudentPoints', '100'),
      ('attendanceDays', '[0,3]'),
      ('attendanceManualEnabled', 'true'),
      ('attendanceAccountEnabled', 'false'),
      ('allowEarlyAttendance', 'true'),
      ('attendanceStartTime', '16:00'),
      ('attendanceLocationUrl', ''),
      ('attendanceLocationLat', ''),
      ('attendanceLocationLng', ''),
      ('staffAttendanceSource', 'supervisor'),
      ('staffAttendanceLocationUrl', ''),
      ('staffAttendanceLocationLat', ''),
      ('staffAttendanceLocationLng', ''),
      ('staffAttendanceLateAfterAsrMinutes', '50'),
      ('attendanceAbsentTemplate', 'السلام عليكم، تم تسجيل غياب الطالب {name} بتاريخ {date}.'),
      ('automaticAbsenceMessageEnabled', 'false'),
      ('automaticExecutionMessageEnabled', 'false'),
      ('automaticExecutionMessageTime', '23:59'),
      ('automaticExecutionLastRunDate', ''),
      ('quranReferenceMode', 'ayah'),
      ('registrationEnabled', 'false'),
      ('registrationPreAcceptTemplate', 'السلام عليكم، تم قبول طلب تسجيل الطالب {name} مبدئياً، وسيتم التواصل معكم لإكمال الإجراء.'),
      ('registrationAcceptTemplate', 'السلام عليكم، تم قبول الطالب {name} في حلقة {committee}. رقم الدخول: {login}.'),
      ('registrationRejectTemplate', 'السلام عليكم، نعتذر عن قبول طلب تسجيل الطالب {name} حالياً.'),
      ('executionReminderTemplate', 'السلام عليكم، لم يتم تنفيذ خطة الطالب {name} بتاريخ {date}.'),
      ('weeklyHolidayDays', '[5,6]'),
      ('holidayTaskTypes', '[]'),
      ('recitationSessionDays', '[0,1,2,3,4]'),
      ('quranTaskExecutionSource', 'student'),
      ('memorizationExecutionSource', 'teacher'),
      ('reviewExecutionSource', 'both'),
      ('linkExecutionSource', 'both'),
      ('repeatExecutionSource', 'both'),
      ('recitationAmountDay', 'previous_day'),
      ('studentTaskAmountEditable', 'true'),
      ('studentReviewAmountEditable', 'true'),
      ('studentLinkAmountEditable', 'true'),
      ('allowQuranCompensation', 'true'),
      ('allowQuranExtra', 'false'),
      ('recitationAttendanceSource', 'supervisor'),
      ('currentTermStartDate', ''),
      ('quranPlanStartDate', ''),
      ('quranPlanEndDate', ''),
      ('memorizationRecitationMode', 'mushaf'),
      ('masteryRecitationMode', 'mushaf'),
      ('reviewRecitationMode', 'mushaf'),
      ('linkRecitationMode', 'mushaf'),
      ('narrationMaxScore', '100'),
      ('narrationWarningDeduction', '1'),
      ('narrationHesitationDeduction', '0'),
      ('narrationMistakeDeduction', '5'),
      ('narrationStartTemplate', 'السلام عليكم، بدأ {eventName} من {fromDate} إلى {toDate}.'),
      ('narrationEndTemplate', 'السلام عليكم، انتهى {eventName}.'),
      ('narrationResultTemplate', 'نتيجة {name} في {eventName}: {score} من 100، التقدير {rating}.'),
      ('memorizationRepeatCount', '1'),
      ('masteryRepeatCount', '1'),
      ('memorizationListeningCount', '3'),
      ('masteryListeningCount', '3'),
      ('allowRepeatCountEditing', 'false'),
      ('allowListeningCountEditing', 'false'),
      ('homepageStats', '[]')
    `
  );
  await pool.query(`
    INSERT IGNORE INTO app_settings (setting_key, setting_value)
    SELECT 'maxSupervisorFamilyItemsPoints', COALESCE(
      (SELECT setting_value FROM app_settings WHERE setting_key = 'maxStudentPoints' LIMIT 1),
      '100'
    )
  `);
  await pool.query("DELETE FROM app_settings WHERE setting_key = 'attendancePresentTemplate'");
  await pool.query("DELETE FROM app_settings WHERE setting_key = 'maxSupervisorFamilyPoints'");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS learning_paths (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(180) NOT NULL,
      status ENUM('open', 'locked') NOT NULL DEFAULT 'open',
      committee_id BIGINT UNSIGNED NULL,
      content_description TEXT NULL,
      content_type ENUM('text', 'link', 'pdf', 'image', 'file') NOT NULL DEFAULT 'text',
      content_value LONGTEXT NULL,
      points_reward INT NOT NULL DEFAULT 0,
      allow_multiple_attempts TINYINT(1) NOT NULL DEFAULT 0,
      allow_student_attachment TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT learning_paths_committee_id_fk
        FOREIGN KEY (committee_id) REFERENCES committees(id)
        ON UPDATE CASCADE ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('learning_paths', 'points_reward', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('learning_paths', 'allow_multiple_attempts', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER points_reward');
  await addColumnIfMissing('learning_paths', 'sort_order', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('learning_paths', 'content_description', 'TEXT NULL');
  await addColumnIfMissing('learning_paths', 'allow_student_attachment', 'TINYINT(1) NOT NULL DEFAULT 0');
  await pool.query("ALTER TABLE learning_paths MODIFY content_type ENUM('text', 'link', 'pdf', 'image', 'file') NOT NULL DEFAULT 'text'");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS learning_path_content_blocks (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      path_id BIGINT UNSIGNED NOT NULL,
      block_type ENUM('text', 'link', 'pdf', 'image', 'file') NOT NULL,
      content_value LONGTEXT NOT NULL,
      file_name VARCHAR(255) NULL,
      mime_type VARCHAR(120) NULL,
      sort_order INT NOT NULL DEFAULT 0,
      CONSTRAINT learning_path_content_blocks_path_id_fk
        FOREIGN KEY (path_id) REFERENCES learning_paths(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX learning_path_content_blocks_order (path_id, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await modifyColumn('learning_path_content_blocks', 'block_type', "ENUM('text', 'link', 'pdf', 'image', 'file') NOT NULL");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS learning_path_questions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      path_id BIGINT UNSIGNED NOT NULL,
      question_text VARCHAR(500) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      CONSTRAINT learning_path_questions_path_id_fk
        FOREIGN KEY (path_id) REFERENCES learning_paths(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS learning_path_options (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      question_id BIGINT UNSIGNED NOT NULL,
      option_text VARCHAR(300) NOT NULL,
      is_correct TINYINT(1) NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      CONSTRAINT learning_path_options_question_id_fk
        FOREIGN KEY (question_id) REFERENCES learning_path_questions(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_path_progress (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      path_id BIGINT UNSIGNED NOT NULL,
      status ENUM('started', 'completed') NOT NULL DEFAULT 'started',
      score INT NOT NULL DEFAULT 0,
      total_questions INT NOT NULL DEFAULT 0,
      earned_points INT NOT NULL DEFAULT 0,
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY student_path_unique (student_id, path_id),
      CONSTRAINT student_path_progress_student_id_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT student_path_progress_path_id_fk
        FOREIGN KEY (path_id) REFERENCES learning_paths(id)
        ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('student_path_progress', 'earned_points', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing('student_path_progress', 'attachment_name', 'VARCHAR(255) NULL');
  await addColumnIfMissing('student_path_progress', 'attachment_type', 'VARCHAR(120) NULL');
  await addColumnIfMissing('student_path_progress', 'attachment_data', 'LONGTEXT NULL');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supervisor_family_point_awards (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      supervisor_id BIGINT UNSIGNED NOT NULL,
      committee_id BIGINT UNSIGNED NOT NULL,
      item_id BIGINT UNSIGNED NULL,
      points INT NOT NULL,
      award_date DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT family_awards_supervisor_id_fk
        FOREIGN KEY (supervisor_id) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT family_awards_committee_id_fk
        FOREIGN KEY (committee_id) REFERENCES committees(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX family_awards_lookup (supervisor_id, committee_id, award_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supervisor_family_items (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      supervisor_id BIGINT UNSIGNED NOT NULL,
      name VARCHAR(180) NOT NULL,
      max_points INT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT supervisor_family_items_supervisor_id_fk
        FOREIGN KEY (supervisor_id) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX supervisor_family_items_lookup (supervisor_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('supervisor_family_point_awards', 'item_id', 'BIGINT UNSIGNED NULL');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS supervisor_student_point_awards (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      supervisor_id BIGINT UNSIGNED NOT NULL,
      student_id BIGINT UNSIGNED NOT NULL,
      points INT NOT NULL,
      award_date DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT student_awards_supervisor_id_fk
        FOREIGN KEY (supervisor_id) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT student_awards_student_id_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      INDEX student_awards_lookup (supervisor_id, student_id, award_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_point_transactions (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      student_id BIGINT UNSIGNED NOT NULL,
      supervisor_id BIGINT UNSIGNED NULL,
      transaction_type ENUM('increase', 'deduction') NOT NULL,
      points DECIMAL(10,2) NOT NULL,
      reason VARCHAR(500) NOT NULL,
      transaction_date DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT point_transactions_student_id_fk
        FOREIGN KEY (student_id) REFERENCES students(id)
        ON UPDATE CASCADE ON DELETE CASCADE,
      CONSTRAINT point_transactions_supervisor_id_fk
        FOREIGN KEY (supervisor_id) REFERENCES supervisors(id)
        ON UPDATE CASCADE ON DELETE SET NULL,
      INDEX point_transactions_student_lookup (student_id, created_at),
      INDEX point_transactions_report_lookup (transaction_date, supervisor_id, student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnIfMissing('student_point_transactions', 'source_type', "VARCHAR(40) NOT NULL DEFAULT 'manual'");
  await addColumnIfMissing('student_point_transactions', 'source_id', 'BIGINT UNSIGNED NULL');
  await addColumnIfMissing('student_point_transactions', 'actor_role', 'VARCHAR(40) NULL');
  await addColumnIfMissing('student_point_transactions', 'actor_name', 'VARCHAR(180) NULL');
  await addColumnIfMissing('student_point_transactions', 'dedupe_key', 'VARCHAR(190) NULL');
  await backfillPointTransactionActors();
  await addIndexIfMissing(
    'student_point_transactions',
    'point_transactions_dedupe_unique',
    'UNIQUE INDEX point_transactions_dedupe_unique (dedupe_key)'
  );
  await syncStudentPointsFromTransactions();

  const shouldSeedDefaultData = seedDefaultData
    ?? String(process.env.SEED_DEFAULT_DATA || 'true').toLowerCase() !== 'false';
  if (shouldSeedDefaultData) {
    const [rows] = await pool.query('SELECT COUNT(*) AS count FROM committees');
    if (rows[0].count === 0) {
      await pool.query(
        'INSERT INTO committees (name) VALUES (?), (?), (?)',
        ['حلقة الفجر', 'حلقة الإتقان', 'حلقة التميز']
      );
    }
  }
  await runPendingDatabaseMigrations({ pool, databaseName });
  });
  return initializedPool;
}

export async function initDatabase(databaseName = defaultDatabaseName, options = {}) {
  const normalizedName = String(databaseName || '').trim();
  if (!/^\w+$/.test(normalizedName)) {
    throw new Error('Database name is invalid.');
  }
  if (databaseInitializations.has(normalizedName)) return databaseInitializations.get(normalizedName);
  if (databasePools.has(normalizedName)) {
    touchDatabasePool(normalizedName);
    return databasePools.get(normalizedName);
  }

  const initialization = initializeDatabase(normalizedName, options)
    .catch(async (error) => {
      const failedPool = databasePools.get(normalizedName);
      databasePools.delete(normalizedName);
      databasePoolUsage.delete(normalizedName);
      if (normalizedName === defaultDatabaseName) defaultPool = undefined;
      await failedPool?.end().catch(() => {});
      throw error;
    })
    .finally(() => databaseInitializations.delete(normalizedName));
  databaseInitializations.set(normalizedName, initialization);
  return initialization;
}

export function runWithDatabase(databaseName, context, callback) {
  const normalizedName = String(databaseName || '').trim();
  const selectedPool = databasePools.get(normalizedName);
  if (!selectedPool) throw new Error(`Database ${normalizedName} is not initialized.`);
  const usage = touchDatabasePool(normalizedName);
  usage.activeContexts += 1;
  return databaseContext.run(
    { ...(context), databaseName: normalizedName, pool: selectedPool },
    async () => {
      try {
        return await callback();
      } finally {
        usage.activeContexts = Math.max(0, usage.activeContexts - 1);
        usage.lastUsedAt = Date.now();
      }
    },
  );
}

export function getDatabaseContext() {
  const current = databaseContext.getStore();
  return current
    ? { databaseName: current.databaseName, tenant: current.tenant || null }
    : { databaseName: defaultDatabaseName, tenant: null };
}

export function db() {
  const currentPool = activePool();
  if (!currentPool) {
    throw new Error('Database pool is not initialized.');
  }
  return undoDatabase(currentPool);
}

const databasePoolSweep = setInterval(() => {
  evictIdleDatabasePools().catch((error) => {
    console.error('Database pool cleanup failed:', error.message);
  });
}, DATABASE_POOL_SWEEP_MS);
databasePoolSweep.unref?.();
