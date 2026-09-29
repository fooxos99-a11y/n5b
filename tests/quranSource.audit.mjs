import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { Buffer } from 'node:buffer';

// Read-only, opt-in comparison against the published upstream corpus and fonts.
const hash = (data) => createHash('sha256').update(data).digest('hex');
const local = new Map();
for (let page = 1; page <= 604; page += 1) {
  const data = JSON.parse(await readFile(`public/quran/hafs/pages/${page}.json`, 'utf8'));
  for (const word of data.words) { assert.ok(!local.has(word.location)); local.set(word.location, word); }
}
async function fetchSource(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(30000) });
      assert.equal(response.status, 200, url);
      return response;
    } catch (error) { if (attempt === 3) throw error; }
  }
}
async function pool(items, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}
const checked = new Set();
const verses = new Set();
const differences = [];
await pool(Array.from({ length: 114 }, (_, i) => i + 1), async (chapter) => {
  let page = 1;
  do {
    const payload = await (await fetchSource(`https://api.quran.com/api/v4/verses/by_chapter/${chapter}?words=true&word_fields=verse_key,location,page_number,line_number,code_v2,text_qpc_hafs&per_page=50&page=${page}`)).json();
    for (const verse of payload.verses) {
      verses.add(verse.verse_key);
      for (const word of verse.words) {
        const actual = local.get(word.location);
        const expected = { page: word.page_number, line: word.line_number, position: word.position,
          verseKey: verse.verse_key, charType: word.char_type_name, codeV2: word.code_v2, textQpcHafs: word.text_qpc_hafs };
        checked.add(word.location);
        for (const [key, value] of Object.entries(expected)) {
          if (actual?.[key] !== value) differences.push({ location: word.location, key, expected: value, actual: actual?.[key] });
        }
      }
    }
    page = payload.pagination.next_page;
  } while (page);
});
process.stdout.write(`Corpus: ${verses.size} verses, ${checked.size} entries, ${differences.length} differences\n`);
const fonts = [];
await pool([...Array.from({ length: 604 }, (_, i) => `p${i + 1}`), 'uthmanic-hafs'], async (name) => {
  const suffix = name === 'uthmanic-hafs' ? 'uthmanic_hafs/UthmanicHafs1Ver18.woff2' : `v2/woff2/${name}.woff2`;
  const source = `https://verses.quran.foundation/fonts/quran/hafs/${suffix}`;
  const remoteHash = hash(Buffer.from(await (await fetchSource(source)).arrayBuffer()));
  const localHash = hash(await readFile(`public/quran/hafs/fonts/${name}.woff2`));
  fonts.push({ name, source, localHash, remoteHash, matches: remoteHash === localHash });
});
const extraLocations = [...local.keys()].filter((key) => !checked.has(key));
await writeFile('outputs/quran-quality-audit/source-comparison.json', JSON.stringify({
  checkedAt: new Date().toISOString(), source: 'https://api.quran.com/api/v4/verses/by_chapter/',
  verses: verses.size, entries: checked.size, differences, extraLocations, fonts,
}, null, 2));
assert.equal(verses.size, 6236);
assert.equal(differences.length, 0);
assert.equal(extraLocations.length, 0);
assert.ok(fonts.every((font) => font.matches));
process.stdout.write(`All ${fonts.length} font binaries match SHA-256.\n`);
