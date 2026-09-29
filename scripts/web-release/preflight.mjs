import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

let failureCode = 41;
try {
  const [release, configPath] = process.argv.slice(2);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (!Array.isArray(config.databases) || !config.databases.length || config.databases.some(database => typeof database !== 'string' || !database.trim())) {
    throw new Error('Missing database configuration');
  }
  failureCode = 42;
  const { default: dotenv } = await import(pathToFileURL(`${release}/node_modules/dotenv/lib/main.js`));
  const { default: mysql } = await import(pathToFileURL(`${release}/node_modules/mysql2/promise.js`));
  failureCode = 43;
  const { loadDatabaseMigrations } = await import(pathToFileURL(`${release}/server/databaseMigrations.js`));
  failureCode = 41;
  const env = dotenv.parse(fs.readFileSync(`${release}/.env`));
  failureCode = 43;
  const migrations = await loadDatabaseMigrations();
  for (const database of config.databases) {
    failureCode = 44;
    const connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT || 3306), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database });
    try {
      const [tables] = await connection.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='schema_migrations'");
      if (!tables.length) continue;
      const [rows] = await connection.query('SELECT version FROM schema_migrations');
      const applied = new Set(rows.map(row => String(row.version)));
      if (migrations.some(migration => !applied.has(migration.version))) {
        failureCode = 45;
        throw new Error('Database migration requires a separate reviewed deployment');
      }
    } finally { await connection.end(); }
  }
} catch {
  // Fixed exit codes cross the SSH boundary; database errors may contain secrets.
  process.exitCode = failureCode;
}
