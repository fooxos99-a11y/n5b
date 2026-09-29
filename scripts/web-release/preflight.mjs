import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';

const [release, configPath] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { default: dotenv } = await import(pathToFileURL(`${release}/node_modules/dotenv/lib/main.js`));
const { default: mysql } = await import(pathToFileURL(`${release}/node_modules/mysql2/promise.js`));
const { loadDatabaseMigrations } = await import(pathToFileURL(`${release}/server/databaseMigrations.js`));
const env = dotenv.parse(fs.readFileSync(`${release}/.env`));
const migrations = await loadDatabaseMigrations();
for (const database of config.databases) {
  const connection = await mysql.createConnection({ host: env.MYSQL_HOST, port: Number(env.MYSQL_PORT || 3306), user: env.MYSQL_USER, password: env.MYSQL_PASSWORD, database });
  try {
    const [tables] = await connection.query("SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='schema_migrations'");
    if (!tables.length) continue;
    const [rows] = await connection.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map(row => row.version));
    if (migrations.some(migration => !applied.has(migration.version))) throw new Error('Database migration requires a separate reviewed deployment');
  } finally { await connection.end(); }
}
