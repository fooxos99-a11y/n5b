import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const assetUrl = (path) => new URL(`../public/quran/hafs/${path}`, import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(assetUrl(path), 'utf8'));

test('traditional display maps every canonical word to a packaged V1 font without changing canonical data', async () => {
  const [manifest, canonicalIndex, layoutFiles, fontFiles] = await Promise.all([
    readJson('layout-v1/manifest.json'),
    readJson('index.json'),
    readdir(assetUrl('layout-v1/')),
    readdir(assetUrl('fonts/v1/')),
  ]);
  assert.equal(manifest.canonicalPageCount, 604);
  assert.equal(layoutFiles.filter((name) => /^\d+\.json$/.test(name)).length, 604);
  assert.equal(fontFiles.filter((name) => /^p\d+\.woff2$/.test(name)).length, 604);
  const locations = new Set();
  let shiftedWords = 0;
  for (let page = 1; page <= 604; page += 1) {
    const [canonicalBytes, layoutBytes, fontBytes] = await Promise.all([
      readFile(assetUrl(`pages/${page}.json`)),
      readFile(assetUrl(`layout-v1/${page}.json`)),
      readFile(assetUrl(`fonts/v1/p${page}.woff2`)),
    ]);
    const canonical = JSON.parse(canonicalBytes.toString());
    const layout = JSON.parse(layoutBytes.toString());
    assert.equal(createHash('sha256').update(canonicalBytes).digest('hex'), canonicalIndex.pageHashes[page]);
    assert.equal(createHash('sha256').update(layoutBytes).digest('hex'), manifest.pageHashes[page]);
    assert.equal(createHash('sha256').update(fontBytes).digest('hex'), manifest.fontHashes[page]);
    assert.equal(fontBytes.subarray(0, 4).toString(), 'wOF2');
    assert.ok(fontBytes.length > 1000);
    assert.equal(layout.page, page);
    assert.deepEqual(Object.keys(layout.words), canonical.words.map((word) => word.location));
    for (const word of canonical.words) {
      assert.ok(!locations.has(word.location));
      locations.add(word.location);
      const display = layout.words[word.location];
      assert.ok(display.codeV1);
      assert.ok(Number.isInteger(display.pageV1) && display.pageV1 >= 1 && display.pageV1 <= 604);
      assert.ok(Number.isInteger(display.lineV1) && display.lineV1 >= 1 && display.lineV1 <= 15);
      if (display.pageV1 !== page) shiftedWords += 1;
    }
  }
  assert.equal(locations.size, manifest.wordCount);
  assert.equal(shiftedWords, manifest.shiftedWords);
});

test('V1 page 64 follows the reference line breaks rather than modern V2 line breaks', async () => {
  const layout = await readJson('layout-v1/64.json');
  assert.equal(layout.words['3:109:1'].lineV1, 1);
  assert.equal(layout.words['3:109:11'].lineV1, 1);
  assert.equal(layout.words['3:109:12'].lineV1, 2);
  assert.equal(layout.words['3:110:14'].lineV1, 3);
  assert.equal(layout.words['3:110:15'].lineV1, 4);
  assert.equal(layout.words['3:110:21'].lineV1, 4);
  assert.equal(layout.words['3:110:22'].lineV1, 5);
  assert.equal(layout.words['3:115:2'].lineV1, 14);
  assert.equal(layout.words['3:115:10'].lineV1, 15);
  assert.equal(layout.words['3:109:1'].codeV1, 'ﭑ');
});
