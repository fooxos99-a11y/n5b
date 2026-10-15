import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  collectQcfPageWords,
  getInclusiveQcfPages,
  getQcfSourcePages,
} from '../server/services/quranMushafWordLayout.js';
import { readLocalMushafPage } from '../server/services/localMushaf.js';
import { formatQuranSelectionText, toArabicIndicDigits } from '../shared/quranSelectionText.js';

test('loads both neighboring source pages when verse pagination differs from the QCF face', () => {
  assert.deepEqual(getQcfSourcePages(586), [585, 586, 587]);
  assert.deepEqual(getQcfSourcePages(1), [1, 2]);
  assert.deepEqual(getQcfSourcePages(604), [603, 604]);
  assert.deepEqual(getQcfSourcePages(0), []);
  assert.deepEqual(getQcfSourcePages(605), []);
});

test('retains Ar-Rahman verses returned on API page 532 but printed on QCF page 531', () => {
  const payloads = new Map([[532, { verses: [{ verse_key: '55:17', words: [{
    id: 19356, page_number: 531, line_number: 14, position: 1, location: '55:17:1',
    code_v2: 'ﲱ', text_qpc_hafs: 'رَبُّ',
  }] }] }]]);
  const words = collectQcfPageWords(getQcfSourcePages(531).map((page) => payloads.get(page)), 531);
  assert.equal(words.length, 1);
  assert.equal(words[0].verseKey, '55:17');
});

test('opens every QCF face reached by the task boundary', () => {
  assert.deepEqual(getInclusiveQcfPages(585, 586), [585, 586]);
  assert.deepEqual(getInclusiveQcfPages(586, 585), [586, 585]);
});

test('loads supervisor Mushaf faces from the packaged offline source', async () => {
  const page = await readLocalMushafPage(586);
  assert.equal(page.page, 586);
  assert.ok(page.words.some((word) => word.location === '80:41:1'));
  assert.ok(page.words.some((word) => word.location === '81:1:1'));
  assert.equal(await readLocalMushafPage(0), null);
});

test('keeps native system surfaces aligned with the active Mushaf theme', async () => {
  const [bridge, hook, styles, systemBars, chromeHook] = await Promise.all([
    readFile(new URL('../src/components/native/NativeAppBridge.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useNativeSurfaceTheme.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/nativeSystemBars.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/hooks/useNativeSystemBars.js', import.meta.url), 'utf8'),
  ]);

  assert.match(bridge, /useNativeSystemBars/);
  assert.match(chromeHook, /syncNativeSystemBars/);
  assert.match(chromeHook, /data-native-surface/);
  assert.match(systemBars, /#020617/);
  assert.match(hook, /root\.dataset\.nativeSurface/);
  assert.match(styles, /html\[data-native-surface="dark"\]/);
});

test('keeps verses 41 and 42 on face 586 even when returned by source face 585', () => {
  const source585 = {
    verses: [{
      verse_key: '80:41',
      words: [{ id: 1, page_number: 586, line_number: 1, location: '80:41:1' }],
    }],
  };
  const source586 = {
    verses: [{
      verse_key: '81:1',
      words: [{ id: 2, page_number: 586, line_number: 4, location: '81:1:1' }],
    }],
  };

  assert.deepEqual(
    collectQcfPageWords([source585, source586], 586).map((word) => word.verseKey),
    ['80:41', '81:1']
  );
  assert.deepEqual(collectQcfPageWords([source585], 585), []);
});

test('places the completed ayah number between selected words from consecutive ayahs', () => {
  const words = [
    { charType: 'word', verseKey: '74:8', location: '74:8:1', textQpcHafs: 'فَإِذَا' },
    { charType: 'word', verseKey: '74:8', location: '74:8:2', textQpcHafs: 'نُقِرَ' },
    { charType: 'word', verseKey: '74:8', location: '74:8:3', textQpcHafs: 'فِي ٱلنَّاقُورِ' },
    { charType: 'word', verseKey: '74:9', location: '74:9:1', textQpcHafs: 'فَذَٰلِكَ' },
    { charType: 'word', verseKey: '74:9', location: '74:9:2', textQpcHafs: 'يَوْمَئِذٍۢ' },
  ];

  assert.equal(
    formatQuranSelectionText(words),
    'فَإِذَا نُقِرَ فِي ٱلنَّاقُورِ ﴿٨﴾ فَذَٰلِكَ يَوْمَئِذٍۢ'
  );
  assert.equal(formatQuranSelectionText(words.slice(0, 3)), 'فَإِذَا نُقِرَ فِي ٱلنَّاقُورِ');
  assert.equal(toArabicIndicDigits(101), '١٠١');
});

test('preserves selection constraints, packaged fonts, and recitation contracts in the shared reader', async () => {
  const [page, carousel, themes, dialog, studentMushaf, markDialog, server] = await Promise.all([
    readFile(new URL('../src/components/portal/MadaniMushafPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafPageCarousel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafThemeSwitch.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafRecitationDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/StudentMushafSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafWordMarkDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);

  // Pixel placement, theme parity and overlay geometry are verified by mushafReader.browser.mjs.
  assert.match(page, /data-mushaf-no-swipe/);
  assert.match(page, /!withinAllowedRange \? 'pointer-events-none opacity-20 grayscale'/);
  assert.match(page, /aria-disabled=\{!withinAllowedRange/);
  assert.match(page, /word.charType === 'word' && withinAllowedRange/);
  assert.match(page, /onSelectionStart\?\.\(index\)/);
  assert.match(page, /onSelectionMove\?\.\(Number\(target.dataset.mushafWordIndex\)\)/);
  assert.match(carousel, /pageNumber, pageNumbers = \[\]/);
  assert.match(carousel, /moveByPage\(deltaX < 0 \? -1 : 1\)/);
  assert.match(carousel, /onPointerDownCapture=\{startSwipe\}/);
  assert.match(carousel, /\[data-mushaf-no-swipe\]/);
  assert.doesNotMatch(carousel, /data-mushaf-word-index/);
  assert.match(carousel, /pageAction: pageControls/);
  assert.match(themes, /theme === 'dark' \? 'light' : 'dark'/);
  assert.match(dialog, /nukhab_mushaf_theme/);
  assert.match(dialog, /getItem\('nukhab_mushaf_theme'\) === 'dark' \? 'dark' : 'light'/);
  assert.match(dialog, /<FullScreenPage open=\{open\}/);
  assert.match(dialog, /useNativeSurfaceTheme\(mushafTheme, open\)/);
  assert.match(dialog, /if \(loadError\) \{\s*return/);
  assert.match(dialog, /إعادة المحاولة/);
  assert.match(dialog, /pageNumber=\{activeEntry\.page\.page\}/);
  assert.match(dialog, /const currentTaskLoadKey = taskLoadKey\(tasks\)/);
  assert.match(dialog, /tasksRef\.current = tasks/);
  assert.match(dialog, /activeEntry && activeFontResolved/);
  assert.match(dialog, /fontReady=\{activeFontReady\}/);
  assert.doesNotMatch(dialog, /\[loadTaskData, loadVersion, open/);
  assert.doesNotMatch(studentMushaf, /getCachedOfflineMushafPage/);
  assert.doesNotMatch(studentMushaf, /setPageData\(null\)/);
  assert.match(studentMushaf, /setPage\(boundedPage\)/);
  assert.match(dialog, /formatQuranSelectionText\(selectedWords\)/);
  assert.match(markDialog, /<DialogTitle className="sr-only">تحديد موضع التسميع<\/DialogTitle>/);
  assert.match(markDialog, /<Label>ملاحظة<\/Label>/);
  assert.match(markDialog, /fontFamily: "'Uthmanic-Hafs', 'Amiri', serif"/);
  assert.match(server, /formatQuranSelectionText\(selectedWords\)/);
  assert.match(server, /readLocalMushafPage\(page\)/);
});
