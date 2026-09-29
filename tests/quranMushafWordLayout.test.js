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

test('renders a stable fifteen-line Mushaf face with coordinated themes and compact controls', async () => {
  const [page, carousel, carouselStyles, controls, frame, decoration, banner, themes, dialog, studentMushaf, markDialog, backButton, server] = await Promise.all([
    readFile(new URL('../src/components/portal/MadaniMushafPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafPageCarousel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafPageCarousel.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafPageControls.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafPageFrame.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafLineDecoration.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafSurahBanner.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafThemeSwitch.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafRecitationDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/StudentMushafSection.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/portal/MushafWordMarkDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ui/page-back-button.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../server/index.js', import.meta.url), 'utf8'),
  ]);

  assert.match(page, /topSurahDecoration && \(\s*<MushafPageHeader/);
  assert.match(page, /decorationsByLine\.get\(lineIndex \+ 1 - lineShift\) \? \(/);
  assert.match(page, /<MushafLineDecoration decoration=\{decorationsByLine\.get/);
  assert.doesNotMatch(page, /MushafPageMeta|juzNumber|pageSurahName/);
  assert.match(page, /aspect-\[13\/24\]/);
  assert.match(page, /grid-rows-\[repeat\(15/);
  assert.match(page, /pb-\[16%\] pt-\[5%\]/);
  assert.match(page, /aspect-\[13\/24\] h-full max-h-full w-auto/);
  assert.match(page, /maxWidth: 'min\(100%, 38rem\)'/);
  assert.match(page, /fontSize: '4\.7cqw'/);
  assert.match(page, /data-mushaf-no-swipe/);
  assert.match(page, /!withinAllowedRange \? 'pointer-events-none opacity-20 grayscale'/);
  assert.match(page, /aria-disabled=\{!withinAllowedRange/);
  assert.doesNotMatch(page, /invisible/);
  assert.doesNotMatch(page, /fontSize: 'clamp\(/);
  assert.match(page, /bg-\[#172033\]/);
  assert.match(page, /bg-\[#fffdf7\]/);
  assert.match(page, /pageAction/);
  assert.match(page, /items-center justify-center gap-0 whitespace-nowrap/);
  assert.doesNotMatch(page, /justify-between/);
  assert.doesNotMatch(page, /#9b7b43|#c9ad74/);
  assert.doesNotMatch(page, /\{footer \|\| null\}/);
  assert.match(carousel, /pageNumber, pageNumbers = \[\]/);
  assert.match(carousel, /moveByPage\(deltaX < 0 \? -1 : 1\)/);
  assert.match(carousel, /onPointerDownCapture=\{startSwipe\}/);
  assert.match(carousel, /\[data-mushaf-no-swipe\]/);
  assert.doesNotMatch(carousel, /data-mushaf-word-index/);
  assert.match(carousel, /React\.cloneElement\(children, \{ pageAction: pageControls \}\)/);
  assert.match(carousel, /MushafPageControls/);
  assert.match(carousel, /'mushaf-page-turn--' \+ turnDirection/);
  assert.match(carouselStyles, /rotateY\(2\.5deg\)/);
  assert.match(carouselStyles, /rotateY\(-2\.5deg\)/);
  assert.match(carouselStyles, /animation: none/);
  assert.doesNotMatch(carousel, /<nav/);
  assert.doesNotMatch(carousel, /top-1\/2/);
  assert.match(controls, /absolute inset-x-\[4%\] bottom-0/);
  assert.match(controls, /justify-between/);
  assert.match(controls, /h-11 min-h-11 w-14 min-w-14/);
  assert.match(controls, /h-\[7cqw\] w-\[12cqw\]/);
  assert.match(controls, /text-\[2\.8cqw\]/);
  assert.match(controls, /absolute bottom-\[4cqw\]/);
  assert.match(frame, /bottom-\[8%\]/);
  assert.ok(Math.abs((4 + 3.5) - (((24 / 13) * 100 * 0.08) / 2)) < 0.2, 'controls must be centered between the divider and page edge');
  assert.match(controls, /: 'إنهاء'/);
  assert.match(controls, /pageNumber/);
  assert.match(controls, /<MushafPageNumber pageNumber=\{pageNumber\}/);
  const pageNumber = await readFile(new URL('../src/components/portal/MushafPageNumber.jsx', import.meta.url), 'utf8');
  const studentControls = await readFile(new URL('../src/components/portal/StudentMushafPageControls.jsx', import.meta.url), 'utf8');
  assert.match(pageNumber, /String\(pageNumber\)/);
  assert.doesNotMatch(pageNumber, /rounded|bg-|shadow|border/);
  assert.match(studentControls, /<MushafPageNumber pageNumber=\{pageNumber\}/);
  assert.doesNotMatch(studentMushaf, /MushafReaderNavigation|readingMode/);
  assert.doesNotMatch(controls, /ChevronLeft|ChevronRight|إنهاء التسميع/);
  assert.match(decoration, /decoration\?\.type === 'surah'/);
  assert.match(decoration, /MushafSurahBanner/);
  assert.match(decoration, /text-current/);
  assert.match(decoration, /fontSize: '4\.1cqw'/);
  assert.match(banner, /\{accessibleName\}/);
  assert.match(banner, /h-\[62%\] w-\[48%\]/);
  assert.match(banner, /fontSize: '3\.1cqw'/);
  assert.doesNotMatch(banner, /\btruncate\b/);
  assert.match(banner, /fontFamily: 'var\(--font-ui\)'/);
  assert.match(banner, /text-\[#f6ead2\]/);
  assert.doesNotMatch(banner, /dir="ltr"|surah\$\{glyph\}/);
  assert.match(banner, /<Ornament/);
  assert.doesNotMatch(banner, /radial-gradient|backgroundSize/);
  assert.doesNotMatch(themes, /role="group"|aria-pressed/);
  assert.match(themes, /theme === 'dark' \? 'light' : 'dark'/);
  assert.match(themes, /theme === 'dark' \? <Moon/);
  assert.match(dialog, /nukhab_mushaf_theme/);
  assert.match(dialog, /getItem\('nukhab_mushaf_theme'\) === 'dark' \? 'dark' : 'light'/);
  assert.match(dialog, /<FullScreenPage open=\{open\}/);
  assert.match(dialog, /useNativeSurfaceTheme\(mushafTheme, open\)/);
  assert.match(dialog, /if \(loadError\) \{\s*return/);
  assert.match(dialog, /إعادة المحاولة/);
  assert.match(dialog, /<PageBackButton[\s\S]*?iconOnly/);
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
  assert.doesNotMatch(dialog, /const mistakeCount|const warningCount|MushafPageFooter|MushafPageMeta|MushafFinishButton/);
  assert.match(markDialog, /<DialogTitle className="sr-only">تحديد موضع التسميع<\/DialogTitle>/);
  assert.match(markDialog, /<Label>ملاحظة<\/Label>/);
  assert.match(markDialog, /fontFamily: "'Uthmanic-Hafs', 'Amiri', serif"/);
  assert.doesNotMatch(markDialog, /MousePointer2|DialogHeader|ملاحظة اختيارية/);
  assert.match(backButton, /iconOnly/);
  assert.match(backButton, /!iconOnly &&/);
  assert.match(server, /formatQuranSelectionText\(selectedWords\)/);
  assert.match(server, /readLocalMushafPage\(page\)/);
});
