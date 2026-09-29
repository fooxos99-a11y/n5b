import { createHash } from 'node:crypto';
import process from 'node:process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectQcfPageWords, getQcfSourcePages } from '../server/services/quranMushafWordLayout.js';
import { MUSHAF_DATA_VERSION } from '../shared/mushaf-package.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = path.join(ROOT, 'public', 'quran', 'hafs');
const PAGE_OUTPUT = path.join(OUTPUT_ROOT, 'pages');
const FONT_OUTPUT = path.join(OUTPUT_ROOT, 'fonts');
const PAGE_REFERENCE_PATH = path.join(ROOT, 'server', 'data', 'quran-pages.json');
const PAGE_COUNT = 604;
const CONCURRENCY = 12;
const QURAN_API = 'https://api.quran.com/api/v4';
const FONT_BASE = 'https://verses.quran.foundation/fonts/quran/hafs';
const pagesOnly = process.argv.includes('--pages-only');

const fetchWithRetry = async (url, attempts = 4) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw new Error(`تعذر تنزيل ${url}: ${lastError?.message || 'خطأ غير معروف'}`);
};

const runPool = async (items, worker) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }));
};

const pageNumbers = Array.from({ length: PAGE_COUNT }, (_, index) => index + 1);
const pageReference = JSON.parse(await fs.readFile(PAGE_REFERENCE_PATH, 'utf8'));
const chapterNames = new Map(pageReference.chapters.map((chapter) => [Number(chapter.number), chapter.name]));

await fs.mkdir(PAGE_OUTPUT, { recursive: true });
await fs.mkdir(FONT_OUTPUT, { recursive: true });

const sourcePages = new Map();
await runPool(pageNumbers, async (page) => {
  const response = await fetchWithRetry(`${QURAN_API}/verses/by_page/${page}?words=true&word_fields=verse_key,location,page_number,line_number,code_v2,text_qpc_hafs&per_page=50`);
  sourcePages.set(page, await response.json());
});

const pageHashes = {};
const pageContents = new Map();
await runPool(pageNumbers, async (page) => {
  const payloads = getQcfSourcePages(page).map((sourcePage) => sourcePages.get(sourcePage)).filter(Boolean);
  const words = collectQcfPageWords(payloads, page);
  const decorations = [];
  const handledSurahs = new Set();
  words.forEach((word) => {
    const [surah, ayah] = word.verseKey.split(':').map(Number);
    if (ayah !== 1 || handledSurahs.has(surah)) return;
    handledSurahs.add(surah);
    const firstLine = Number(word.line);
    const hasSeparateBismillah = surah !== 1 && surah !== 9;
    const headerLine = firstLine - (hasSeparateBismillah ? 2 : 1);
    if (headerLine >= 0) {
      decorations.push({ line: headerLine, type: 'surah', surah, name: chapterNames.get(surah) || `سورة ${surah}` });
    }
    if (hasSeparateBismillah && firstLine > 1) {
      decorations.push({ line: firstLine - 1, type: 'bismillah', surah });
    }
  });
  const content = JSON.stringify({ page, words, decorations });
  pageHashes[page] = createHash('sha256').update(content).digest('hex');
  pageContents.set(page, { content, words });
});

// Never replace a complete package with an incomplete upstream response.
const packagedVerses = new Set([...pageContents.values()].flatMap(({ words }) => words.map((word) => word.verseKey)));
const missingVerses = pageReference.ayahs.filter(({ surah, ayah }) => !packagedVerses.has(`${surah}:${ayah}`));
if (missingVerses.length) {
  const missingKeys = missingVerses.map(({ surah, ayah }) => surah + ':' + ayah).join(', ');
  throw new Error(`Incomplete Mushaf: ${missingKeys}`);
}
const versePages = new Map();
for (const page of pageNumbers) {
  for (const word of pageContents.get(page).words) {
    if (!versePages.has(word.verseKey)) versePages.set(word.verseKey, page);
  }
}
const indexedAyahs = pageReference.ayahs.map((ayah) => ({
  ...ayah, page: versePages.get(`${ayah.surah}:${ayah.ayah}`),
}));
const indexedChapters = pageReference.chapters.map((chapter) => {
  const pages = indexedAyahs.filter((ayah) => Number(ayah.surah) === Number(chapter.number)).map((ayah) => ayah.page);
  return { ...chapter, startPage: Math.min(...pages), endPage: Math.max(...pages) };
});
await runPool(pageNumbers, (page) => fs.writeFile(path.join(PAGE_OUTPUT, `${page}.json`), pageContents.get(page).content));

if (!pagesOnly) {
  await runPool(pageNumbers, async (page) => {
    const response = await fetchWithRetry(`${FONT_BASE}/v2/woff2/p${page}.woff2`);
    await fs.writeFile(path.join(FONT_OUTPUT, `p${page}.woff2`), Buffer.from(await response.arrayBuffer()));
  });
  const uthmanicResponse = await fetchWithRetry(`${FONT_BASE}/uthmanic_hafs/UthmanicHafs1Ver18.woff2`);
  await fs.writeFile(path.join(FONT_OUTPUT, 'uthmanic-hafs.woff2'), Buffer.from(await uthmanicResponse.arrayBuffer()));
}

const juzs = Array.from({ length: 30 }, (_, index) => {
  const juz = index + 1;
  const ayahs = indexedAyahs.filter((ayah) => Number(ayah.juz) === juz);
  return {
    number: juz,
    startPage: Math.min(...ayahs.map((ayah) => Number(ayah.page))),
    endPage: Math.max(...ayahs.map((ayah) => Number(ayah.page))),
  };
});

await fs.writeFile(path.join(OUTPUT_ROOT, 'index.json'), JSON.stringify({
  version: MUSHAF_DATA_VERSION,
  riwayah: 'حفص عن عاصم',
  pageCount: PAGE_COUNT,
  chapters: indexedChapters,
  juzs,
  ayahs: indexedAyahs,
  pageHashes,
}));

const fontsSummary = pagesOnly ? '، مع الإبقاء على الخطوط الحالية' : ' و' + (PAGE_COUNT + 1) + ' خط';
process.stdout.write(`حزمة المصحف المحلية: ${PAGE_COUNT} صفحة، ${packagedVerses.size} آية${fontsSummary}.\n`);
