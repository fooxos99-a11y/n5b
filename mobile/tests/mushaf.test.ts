import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeNativeLines, makeNativeWords, selectWord, selectedWords, selectionText, type PageData, type PageLayout } from '../src/domain/mushaf';
import manifest from '../assets/fonts/manifest.json';

function sample(page: number) {
  const data: PageData = JSON.parse(readFileSync(new URL(`../../public/quran/hafs/pages/${page}.json`, import.meta.url), 'utf8'));
  const layout: PageLayout = JSON.parse(readFileSync(new URL(`../../public/quran/hafs/layout-v1/${page}.json`, import.meta.url), 'utf8'));
  return { data, layout, words: makeNativeWords(data, layout) };
}

test('sample pages 1, 2, and 604 keep all original words and glyph coverage', () => {
  for (const page of manifest.samplePages) {
    const { data, words } = sample(page);
    assert.equal(words.length, data.words.length);
    const fonts: Record<string, { glyphAdvance: Record<string, number> }> = manifest.fonts;
    for (const word of words) assert.ok(fonts[String(word.pageV1)]?.glyphAdvance[String(word.codeV1.codePointAt(0))]);
  }
});

test('selection spans lines in both tap orders and excludes ayah markers', () => {
  const { words } = sample(1);
  const start = '1:1:3'; const end = '1:2:3';
  const forward = selectWord(selectWord(null, start, words), end, words);
  const reverse = selectWord(selectWord(null, end, words), start, words);
  assert.deepEqual(selectedWords(forward, words).map(word => word.location), ['1:1:3', '1:1:4', '1:2:1', '1:2:2', '1:2:3']);
  assert.equal(selectionText(forward, words), selectionText(reverse, words));
  assert.match(selectionText(forward, words), /﴿١﴾/);
  assert.ok(selectedWords(forward, words).every(word => word.charType === 'word'));
});

test('invalid location and ayah-marker taps do not change the range', () => {
  const { words } = sample(1);
  const selection = selectWord(null, '1:1:1', words);
  assert.deepEqual(selectWord(selection, '1:1:5', words), selection);
  assert.deepEqual(selectWord(selection, 'missing', words), selection);
  assert.equal(selectedWords(selection, sample(2).words).length, 0);
});

test('wrong page or missing glyph mapping fails before display', () => {
  const { data, layout } = sample(1);
  assert.throws(() => makeNativeWords(data, { ...layout, page: 2 }), /لا تطابق/);
  assert.throws(() => makeNativeWords(data, { ...layout, words: {} }), /غير مكتملة/);
});

test('page 604 places each surah and basmala before its own verse lines', () => {
  const { data, words } = sample(604);
  const lines = makeNativeLines(data, words);
  assert.deepEqual(lines.filter(line => line.decorations.some(item => item.type === 'surah')).map(line => line.line), [1, 5, 10]);
  assert.deepEqual(lines.filter(line => line.decorations.some(item => item.type === 'bismillah')).map(line => line.line), [2, 6, 11]);
  assert.equal(lines.find(line => line.line === 7)?.words[0]?.verseKey, '113:1');
  assert.equal(lines.find(line => line.line === 12)?.words[0]?.verseKey, '114:1');
});

test('converted TTF and current source WOFF2 match the recorded provenance', () => {
  const hash = (url: URL) => createHash('sha256').update(readFileSync(url)).digest('hex');
  for (const [page, font] of Object.entries(manifest.fonts)) {
    assert.equal(hash(new URL(`../../${font.source}`, import.meta.url)), font.sourceSha256);
    assert.equal(hash(new URL(`../assets/fonts/qcf-v1-p${page}.ttf`, import.meta.url)), font.ttfSha256);
  }
  for (const [page, expected] of Object.entries(manifest.layoutSha256)) {
    assert.equal(hash(new URL(`../../public/quran/hafs/layout-v1/${page}.json`, import.meta.url)), expected);
  }
});
