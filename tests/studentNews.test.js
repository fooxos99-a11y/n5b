import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import sharp from 'sharp';
import { normalizeStudentNews } from '../server/services/studentNews.js';
import { emptyStudentNews, visibleStudentNews, upgradeStudentNews } from '../shared/student-news.js';
import { createStudentNewsRouter } from '../server/routes/studentNewsRoutes.js';
const entry = { id: 'one', title: 'تكريم', image: 'image', committeeIds: [4], startsAt: '2026-09-23T09:00', endsAt: '2026-09-23T18:00' };
test('news text colors survive saving and student responses, with safe legacy defaults', async () => {
  for (const textColor of [undefined, '#aBc123']) {
    const content = await normalizeStudentNews({ revision: 0, entries: [{ ...entry, image: '', textColor }] });
    assert.equal(content.entries[0].textColor, textColor ?? '#000000');
    assert.equal(visibleStudentNews(content, { id: 244, committeeId: 4 }, '2026-09-23T12:00').entries[0].textColor, textColor ?? '#000000');
  }
  for (const textColor of ['red', '#fff', 'url(example)', {}, 123]) {
    await assert.rejects(normalizeStudentNews({ revision: 0, entries: [{ ...entry, image: '', textColor }] }), error => error.statusCode === 422);
  }
});
test('text news saves without an image and exposes its body to eligible students', async () => {
  for (const image of ['', undefined, null]) {
    const content = await normalizeStudentNews({ revision: 0, entries: [{ ...entry, image, body: ' تفاصيل الخبر ' }] });
    assert.equal(content.entries[0].image, '');
    assert.equal(visibleStudentNews(content, { id: 244, committeeId: 4 }, '2026-09-23T12:00').entries[0].body, 'تفاصيل الخبر');
  }
  for (const body of ['x'.repeat(2001), {}]) {
    await assert.rejects(normalizeStudentNews({ revision: 0, entries: [{ ...entry, image: '', body }] }), error => error.statusCode === 422);
  }
});
test('each news item independently enforces its circle and schedule without exposing audience IDs', () => {
  const content = { entries: [entry, { ...entry, id: 'two', committeeIds: [], startsAt: '', endsAt: '' }] };
  assert.deepEqual(visibleStudentNews(content, { id: 244, committeeId: 5 }, '2026-09-23T12:00').entries.map(row => row.id), ['two']);
  assert.equal(visibleStudentNews(content, { id: 244, committeeId: 4 }, '2026-09-23T12:00').entries.length, 2);
  for (const now of ['2026-09-23T08:59', '2026-09-23T18:01']) assert.equal(visibleStudentNews(content, { id: 244, committeeId: 4 }, now).entries.length, 1);
  assert.equal(visibleStudentNews({ entries: [{ ...entry, enabled: false }] }, { id: 244, committeeId: 4 }, '2026-09-23T12:00').entries.length, 0);
  assert.equal(visibleStudentNews(content, { id: 244, committeeId: 4 }, '2026-09-23T12:00').entries[0].committeeIds, undefined);
  assert.deepEqual(visibleStudentNews(emptyStudentNews(), { id: 244 }, '2026-09-23T12:00'), { entries: [] });
});
test('legacy news preserves its audience and expiry during upgrade', () => {
  const content = upgradeStudentNews({ images: ['image'], title: 'تكريم', studentIds: [244], expiresOn: '2026-09-23' });
  assert.equal(visibleStudentNews(content, { id: 245 }, '2026-09-23T12:00').entries.length, 0);
  assert.equal(visibleStudentNews(content, { id: 244 }, '2026-09-23T12:00').entries.length, 1);
  assert.equal(visibleStudentNews(content, { id: 244 }, '2026-09-24T00:00').entries.length, 0);
});
test('news validates images, times and circles and reuses bounded WebP images', async () => {
  const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: 'red' } }).png().toBuffer();
  const input = { ...entry, image: `data:image/png;base64,${png.toString('base64')}` };
  const content = await normalizeStudentNews({ revision: 0, entries: [input] });
  const meta = await sharp(Buffer.from(content.entries[0].image.split(',')[1], 'base64')).metadata();
  assert.equal(meta.format, 'webp'); assert.equal(meta.width, 1400); assert.equal(meta.height, 700);
  const previous = { ...content.entries[0], legacyStudentIds: [244] };
  const saved = await normalizeStudentNews({ revision: 1, entries: [{ ...previous, title: 'آخر', legacyStudentIds: [245] }] }, [previous]);
  assert.equal(saved.entries[0].image, previous.image);
  assert.deepEqual(saved.entries[0].legacyStudentIds, [244]);
  const replaced = await normalizeStudentNews({ revision: 1, entries: content.entries }, [previous]);
  assert.equal(replaced.entries[0].legacyStudentIds, undefined);
  for (const invalid of [{ title: '' }, { endsAt: '2026-02-30T12:00' }, { endsAt: '2026-09-22T12:00' }, { committeeIds: [-1] }, { image: 'data:image/svg+xml;base64,AA==' }, { image: 'data:image/png;base64,AAAA' }]) {
    await assert.rejects(normalizeStudentNews({ revision: 0, entries: [{ ...input, ...invalid }] }), error => error.statusCode === 422);
  }
  for (const invalid of [{ revision: -1 }, { entries: Array(9).fill(input) }, { entries: [input, input] }]) await assert.rejects(normalizeStudentNews({ revision: 0, entries: [], ...invalid }), error => error.statusCode === 422);
});
test('news routes authorize management, enforce trusted student circle and reject stale saves', async () => {
  const content = { entries: [entry] }; let writes = 0;
  const database = { query: async (sql, values) => {
    if (sql.startsWith('SELECT content')) return [[{ content: JSON.stringify(content), revision: 2 }]];
    if (sql.startsWith('SELECT id, committee_id')) return [[{ id: values[0], committeeId: values[0] === 244 ? 4 : 5 }]];
    if (sql.startsWith('SELECT id, name')) return [[{ id: 4, name: 'حلقة النور' }]];
    if (sql.startsWith('UPDATE')) { writes++; return [{ affectedRows: values[1] === 2 ? 1 : 0 }]; }
    throw new Error('Unexpected query');
  } };
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.auth = { role: req.headers['x-test-role'], id: Number(req.headers['x-test-id']) }; next(); });
  app.use(createStudentNewsRouter({ getNow: () => '2026-09-23T12:00', db: () => database }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of ['/manage', '/audience']) assert.equal((await fetch(`${url}${path}`, { headers: { 'x-test-role': 'student' } })).status, 403);
    assert.equal((await (await fetch(url, { headers: { 'x-test-role': 'student', 'x-test-id': '245' } })).json()).entries.length, 0);
    assert.equal((await (await fetch(url, { headers: { 'x-test-role': 'student', 'x-test-id': '244' } })).json()).entries[0].title, 'تكريم');
    assert.equal((await (await fetch(`${url}/audience`, { headers: { 'x-test-role': 'manager' } })).json())[0].name, 'حلقة النور');
    const save = revision => fetch(`${url}/manage`, { method: 'PUT', headers: { 'x-test-role': 'manager', 'Content-Type': 'application/json' }, body: JSON.stringify({ ...emptyStudentNews(), revision }) });
    assert.equal((await save(0)).status, 409); assert.equal((await save(2)).status, 200); assert.equal(writes, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('date-only news covers the whole final day and dates remain optional', async () => {
 const content = await normalizeStudentNews({revision: 0, entries: [{...entry, image: '', startsAt: '2026-09-29', endsAt: '2026-09-29'}]});
 assert.equal(content.entries[0].startsAt, '2026-09-29T00:00');
 assert.equal(content.entries[0].endsAt, '2026-09-29T23:59');
 for (const now of ['2026-09-29T00:00', '2026-09-29T23:59']) assert.equal(visibleStudentNews(content, {id: 244, committeeId: 4}, now).entries.length, 1);
 assert.equal(visibleStudentNews(content, {id: 244, committeeId: 4}, '2026-09-30T00:00').entries.length, 0);
 const open = await normalizeStudentNews({revision: 0, entries: [{...entry, image: '', startsAt: '', endsAt: ''}]});
 assert.equal(visibleStudentNews(open, {id: 244, committeeId: 4}, '2027-01-01T12:00').entries.length, 1);
 await assert.rejects(normalizeStudentNews({revision: 0, entries: [{...entry, image: '', startsAt: '', endsAt: '2026-02-30'}]}), error => error.statusCode === 422);
});
