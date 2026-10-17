import '../loadEnvironment.js';
import { initDatabase, runWithDatabase } from '../db.js';
import { startCallArchiveWorker } from '../services/callArchiveWorker.js';

let stopping = false;
process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });
const databases = String(process.env.CALL_ARCHIVE_DATABASES || process.env.MYSQL_DATABASE || '').split(',').map(value => value.trim()).filter(Boolean);
if (!databases.length || databases.some(name => !/^\w+$/.test(name))) throw new Error('Configure CALL_ARCHIVE_DATABASES with explicit database names.');
const stopWorkers = [];
for (const database of databases) {
  await initDatabase(database);
  stopWorkers.push(await runWithDatabase(database, {}, () => startCallArchiveWorker()));
}
while (!stopping) {
  await new Promise(resolve => setTimeout(resolve, 1000));
}
for (const stop of stopWorkers) stop();
process.exit(0);
