import '../loadEnvironment.js';
import { db, initDatabase, runWithDatabase } from '../db.js';
import { getNotificationPushConfig, processNotificationPushBatch } from '../services/notificationPush.js';

let stopping = false;
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
while (!stopping) {
  const databaseNames = Object.keys(JSON.parse(process.env.NOTIFICATION_PUSH_CONFIG_JSON || '{}'));
  for (const databaseName of databaseNames) {
    if (!/^\w+$/.test(databaseName)) throw new Error('Invalid notification database configuration');
    try {
      await initDatabase(databaseName);
      await runWithDatabase(databaseName, {}, () => processNotificationPushBatch(db(), getNotificationPushConfig(databaseName)));
    } catch { console.error('Notification worker failed for a configured database.'); }
  }
  if (!stopping) await new Promise((resolve) => setTimeout(resolve, 5000));
}
process.exit(0);
