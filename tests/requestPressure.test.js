import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiRateLimiter } from '../server/middleware/security.js';
import { createRequestCooldown } from '../src/lib/requestCooldown.js';
import { loadQuranPagePositions, loadAdjacentQuranPosition } from '../server/services/quranTraversalIndex.js';

test('a flood of verse requests cannot consume the interactive API budget', () => {
  const limit = createApiRateLimiter();
  let rejected = 0;
  let accepted = 0;
  const response = { set() {}, status(code) { assert.equal(code, 429); rejected++; return this; }, json() {} };
  for (let i = 0; i < 784; i++) limit({ ip: 'pressure-test', path: `/supervisors/11/quran-evaluation/${i}/ayahs` }, response, () => accepted++);
  assert.equal(accepted, 120);
  assert.equal(rejected, 664);
  for (const path of ['/quran/chapters', '/supervisors/11/quran-evaluation', '/health']) {
    limit({ ip: 'pressure-test', path }, response, () => accepted++);
  }
  assert.equal(accepted, 123);
  assert.equal(rejected, 664);
});

test('cooldowns are shared between tabs, expire, and isolate verse downloads', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  let time = 1000;
  const first = createRequestCooldown({ storage, now: () => time });
  const second = createRequestCooldown({ storage, now: () => time });
  first.record('/api', { status: 429, headers: new Map([['Retry-After', '30'], ['X-RateLimit-Scope', 'recitation-ayahs']]) });
  assert.throws(() => second.check('/api', '/supervisors/11/quran-evaluation/1/ayahs'), (e) => e.status === 429 && e.retryAfterMs === 30000);
  assert.doesNotThrow(() => second.check('/api', '/quran/chapters'));
  assert.doesNotThrow(() => second.check('/another-api', '/supervisors/11/quran-evaluation/1/ayahs'));
  time += 30001;
  assert.doesNotThrow(() => second.check('/api', '/supervisors/11/quran-evaluation/1/ayahs'));
  first.record('/api', { status: 429, headers: new Map() });
  assert.throws(() => second.check('/api', '/supervisors/11/quran-evaluation/1/ayahs'), { status: 429 });
});

test('page boundaries and adjacent positions reuse one reference query without leaking mutations', async () => {
  let queries = 0;
  const db = { query: async () => { queries++; return [[{ page: 1, surah: 1, ayah: 1 }, { page: 1, surah: 1, ayah: 2 }, { page: 2, surah: 2, ayah: 1 }]]; } };
  const page = await loadQuranPagePositions(db, 1);
  page[0].ayah = 99;
  assert.equal((await loadQuranPagePositions(db, 1))[0].ayah, 1);
  assert.equal((await loadAdjacentQuranPosition(db, { page: 1, surah: 1, ayah: 2 }, 'next')).page, 2);
  assert.equal(queries, 1);
  assert.deepEqual(await loadQuranPagePositions({ query: async () => [[]] }, 1), []);
});
