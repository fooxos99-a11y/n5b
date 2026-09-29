import test from 'node:test';
import assert from 'node:assert/strict';
import { readDescendingNextAyah, readQuranAyah, readQuranRange, readQuranChapters } from '../server/services/quranReferenceCache.js';
import { createRefreshGate } from '../src/lib/refreshGate.js';

test('200 concurrent chapter reads share one query, isolate tenants and protect cached rows', async () => {
  let calls = 0;
  const pool = { query: async () => { calls++; return [[{ number: 1, name: 'الفاتحة' }]]; } };
  const results = await Promise.all(Array.from({ length: 200 }, () => readQuranChapters(pool)));
  assert.equal(calls, 1);
  results[0][0].name = 'changed';
  assert.equal(results[199][0].name, 'الفاتحة');
  assert.equal((await readQuranChapters(pool))[0].name, 'الفاتحة');
  const otherPool = { query: async () => [[]] };
  assert.deepEqual(await readQuranChapters(otherPool), []);
});

test('chapter cache evicts failed reads so a later request can recover', async () => {
  let calls = 0;
  const pool = { query: async () => {
    if (++calls === 1) throw new Error('temporary failure');
    return [[{ number: 1 }]];
  } };
  await assert.rejects(readQuranChapters(pool), /temporary failure/);
  assert.deepEqual(await readQuranChapters(pool), [{ number: 1 }]);
  assert.equal(calls, 2);
});

test('descending traversal and reference reads share one query, preserve order and isolate connections', async () => {
 const rows = Array.from({length: 700}, (_, i) => ({surah: 2, ayah: i+1, page: Math.floor(i/10)+1, juz: 1, surahName: 'اختبار', textUthmani: 'نص'}));
 rows.push({ surah: 1, ayah: 1, page: 1, juz: 1 });
 let queries = 0;
 const connection = { query: async () => { queries++; return [rows]; } };
 for (let i = 1; i <= 664; i++) assert.equal((await readDescendingNextAyah(connection,{surah:2,ayah:i})).ayah, i+1);
 assert.equal((await readDescendingNextAyah(connection,{surah:2,ayah:700})).surah,1);
 assert.equal(await readDescendingNextAyah(connection,{surah:1,ayah:1}),null);
 const ayah = await readQuranAyah(connection,2,3); ayah.page=999;
 assert.equal((await readQuranAyah(connection,2,3)).page,1);
 const range = await readQuranRange(connection,2,1); assert.ok(range.every(r => r.page>=1 && r.page<=2));
 assert.equal(queries,1);
 const other = { query: async () => [[]] }; assert.equal(await readQuranAyah(other,2,3),null);
});
test('failed reference load can be retried',async () => {
 let calls=0; const connection={query:async()=>{if(++calls===1)throw new Error('temporary');return [[]];}};
 await assert.rejects(readQuranRange(connection,1,2)); await readQuranRange(connection,1,2); assert.equal(calls,2);
});
test('workspace refresh coalesces overlapping requests and refreshes on expiry or mutations',async () => {
 let now=0,calls=0; const gate=createRefreshGate(300000,()=>now); const run=async()=>++calls;
 assert.deepEqual(await Promise.all([gate('a',run),gate('a',run)]),[1,1]);
 now=60000; await gate('a',run);assert.equal(calls,1);
 await gate('b',run);assert.equal(calls,2);
 await gate('a',run,{force:true});assert.equal(calls,3);
 now=360001;await gate('a',run);assert.equal(calls,4);
 await assert.rejects(gate('fail',async()=>{throw new Error('failed');}));
 assert.equal(await gate('fail',async()=>5),5);
});
