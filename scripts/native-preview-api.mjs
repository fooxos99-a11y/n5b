import assert from 'node:assert/strict';
import express from 'express';
import { readFile } from 'node:fs/promises';

// This entry is exclusively for the synthetic TestFlight environment, never production.
assert.equal(process.env.NUKHAB_APP_VARIANT, 'testflight-preview');
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_expo_preview');
assert.equal(process.env.PLATFORM_MYSQL_DATABASE, 'nukhab_expo_preview_platform');
assert.equal(process.env.MYSQL_USER, 'nukhab_preview');
assert.equal(process.env.SITE_REGISTRATION_NUMBER, 'expo-preview');
assert.equal(process.env.API_HOST, '127.0.0.1');
assert.equal(process.env.API_PORT, '3118');
assert.ok(process.execArgv.some(value => value.includes('isolated-advanced-grading-loader')));
assert.equal(process.env.LIVEKIT_API_SECRET || '', '');
assert.equal(process.env.NOTIFICATION_PUSH_CONFIG_JSON || '{}', '{}');
const marker = JSON.parse(await readFile('../owner.json', 'utf8'));
assert.equal(marker.owner, 'nukhab-expo-preview');
const { initDatabase } = await import('../server/db.js');
const { initPlatformDatabase } = await import('../server/platformDb.js');
const { app } = await import('../server/index.js');
await initDatabase('nukhab_expo_preview', { seedDefaultData: false });
await initPlatformDatabase({ registrationNumber: 'expo-preview', name: 'نخب تجريبي',
  databaseName: 'nukhab_expo_preview', appUrl: 'https://nokhab.cc/n5b-expo-preview',
  apiUrl: 'https://nokhab.cc/n5b-expo-preview/api', whatsappUrl: '' });

const boundary = express();
boundary.disable('x-powered-by');
boundary.use('/api', (req, res, next) => {
  res.setHeader('X-Nukhab-Environment', 'expo-preview');
  if (req.path === '/health' && req.method === 'GET') return next();
  if (req.get('X-Registration-Number') !== 'expo-preview' || /^\/platform(?:\/|$)/i.test(req.path)) {
    return res.status(403).json({ message: 'هذه الخدمة مخصصة لبيئة التجربة.' });
  }
  return next();
});
boundary.use(app);
const server = boundary.listen(3118, '127.0.0.1');
server.once('listening', () => console.info('Nukhba isolated preview API ready on loopback'));
server.once('error', error => { console.error(error.code); process.exitCode = 1; });
