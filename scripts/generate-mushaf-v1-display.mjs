import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_ROOT = path.join(ROOT, 'public', 'quran', 'hafs');
const PAGE_COUNT = 604;
const CONCURRENCY = 8;
const API_BASE = 'https://api.quran.com/api/v4';
const FONT_BASE = 'https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v1-optimized/woff2';
const pages = Array.from({ length: PAGE_COUNT }, (_, index) => index + 1);

const fetchWithRetry = async (url) => {
  let failure;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      failure = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw new Error(`Unable to download ${url}: ${failure?.message || 'unknown error'}`);
};

const runPool = async (items, worker) => {
  let cursor = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index]);
    }
  }));
};

const canonicalPages = new Map();
await runPool(pages, async (page) => {
  canonicalPages.set(page, JSON.parse(await fs.readFile(path.join(ASSET_ROOT, 'pages', `${page}.json`), 'utf8')));
});

const wordsByLocation = new Map();
await runPool(pages, async (page) => {
  const response = await fetchWithRetry(`${API_BASE}/verses/by_page/${page}?words=true&word_fields=location,code_v1,v1_page,line_v1&per_page=50`);
  const payload = await response.json();
  if (!Array.isArray(payload.verses) || !payload.verses.length || payload.pagination?.next_page) {
    throw new Error(`Incomplete source response for page ${page}`);
  }
  for (const verse of payload.verses) {
    for (const word of verse.words || []) {
      const location = String(word.location || '');
      const display = {
        codeV1: String(word.code_v1 || ''),
        pageV1: Number(word.v1_page || 0),
        lineV1: Number(word.line_v1 || 0),
      };
      if (!location || !display.codeV1 || !Number.isInteger(display.pageV1)
        || display.pageV1 < 1 || display.pageV1 > PAGE_COUNT
        || !Number.isInteger(display.lineV1) || display.lineV1 < 1 || display.lineV1 > 15) {
        throw new Error(`Invalid V1 display mapping at ${location || `source page ${page}`}`);
      }
      const previous = wordsByLocation.get(location);
      if (previous && JSON.stringify(previous) !== JSON.stringify(display)) {
        throw new Error(`Conflicting V1 source word ${location}`);
      }
      wordsByLocation.set(location, display);
    }
  }
});

const pageContents = new Map();
const canonicalLocations = new Set();
const shiftedPages = [];
let shiftedWords = 0;
for (const page of pages) {
  const canonical = canonicalPages.get(page);
  const words = {};
  const sourcePages = new Set();
  let pageShiftedWords = 0;
  for (const word of canonical.words) {
    if (canonicalLocations.has(word.location)) throw new Error(`Duplicate canonical word ${word.location}`);
    canonicalLocations.add(word.location);
    const display = wordsByLocation.get(word.location);
    if (!display) throw new Error(`Missing V1 source word ${word.location}`);
    words[word.location] = display;
    sourcePages.add(display.pageV1);
    if (display.pageV1 !== page) pageShiftedWords += 1;
  }
  if (Object.keys(words).length !== canonical.words.length) throw new Error(`Incomplete V1 mapping for canonical page ${page}`);
  if (pageShiftedWords) {
    shiftedWords += pageShiftedWords;
    shiftedPages.push({ page, sourcePages: [...sourcePages].sort((a, b) => a - b), shiftedWords: pageShiftedWords });
  }
  pageContents.set(page, JSON.stringify({ page, words }));
}

// Validate every source mapping and font before replacing any packaged display asset.
const fonts = new Map();
await runPool(pages, async (page) => {
  const response = await fetchWithRetry(`${FONT_BASE}/p${page}.woff2`);
  const font = Buffer.from(await response.arrayBuffer());
  if (font.length < 1000 || font.subarray(0, 4).toString() !== 'wOF2') {
    throw new Error(`Invalid V1 font for page ${page}`);
  }
  fonts.set(page, font);
});

const layoutDirectory = path.join(ASSET_ROOT, 'layout-v1');
const fontDirectory = path.join(ASSET_ROOT, 'fonts', 'v1');
await fs.mkdir(layoutDirectory, { recursive: true });
await fs.mkdir(fontDirectory, { recursive: true });
await runPool(pages, async (page) => {
  await fs.writeFile(path.join(layoutDirectory, `${page}.json`), pageContents.get(page));
  await fs.writeFile(path.join(fontDirectory, `p${page}.woff2`), fonts.get(page));
});

const manifest = {
  version: 1,
  canonicalPageCount: PAGE_COUNT,
  wordCount: canonicalLocations.size,
  shiftedWords,
  shiftedPages,
  pageHashes: Object.fromEntries(pages.map((page) => [page, createHash('sha256').update(pageContents.get(page)).digest('hex')])),
  fontHashes: Object.fromEntries(pages.map((page) => [page, createHash('sha256').update(fonts.get(page)).digest('hex')])),
};
await fs.writeFile(path.join(layoutDirectory, 'manifest.json'), JSON.stringify(manifest));

const fontBytes = [...fonts.values()].reduce((sum, font) => sum + font.length, 0);
const layoutBytes = [...pageContents.values()].reduce((sum, content) => sum + Buffer.byteLength(content), 0);
process.stdout.write(JSON.stringify({
  canonicalPages: PAGE_COUNT,
  fonts: fonts.size,
  mappedWords: canonicalLocations.size,
  shiftedWords,
  shiftedPageCount: shiftedPages.length,
  fontBytes,
  layoutBytes,
}) + '\n');
