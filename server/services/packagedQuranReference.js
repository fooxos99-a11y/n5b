import { readFile } from 'node:fs/promises';

/** The displayed, packaged Mushaf is the authority for page and line coordinates. */
export function buildPackagedQuranReference(pages, metadata) {
  if (pages.length !== 604 || metadata.ayahs?.length !== 6236 || metadata.chapters?.length !== 114) {
    throw new Error('Incomplete packaged Quran reference');
  }
  const verses = new Map();
  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    if (page.page !== index + 1 || !page.words?.length) throw new Error('Invalid packaged Quran page');
    for (const word of page.words) {
      if (!/^\d+:\d+$/.test(word.verseKey) || !(word.line >= 1 && word.line <= 15)) {
        throw new Error('Invalid packaged Quran word coordinate');
      }
      const prior = verses.get(word.verseKey);
      if (!prior) verses.set(word.verseKey, [word.verseKey, page.page, word.line, page.page, word.line]);
      else { prior[3] = page.page; prior[4] = word.line; }
    }
  }
  if (verses.size !== 6236 || metadata.ayahs.some(row => !verses.has(`${row.surah}:${row.ayah}`))) {
    throw new Error('Packaged Quran verses do not match the complete reference');
  }
  const ayahs = metadata.ayahs.map(row => ({ ...row, page: verses.get(`${row.surah}:${row.ayah}`)[1] }));
  const chapters = metadata.chapters.map(chapter => {
    const positions = ayahs.filter(row => row.surah === chapter.number).map(row => row.page);
    return { ...chapter, startPage: Math.min(...positions), endPage: Math.max(...positions) };
  });
  return { reference: { ...metadata, source: 'Packaged Hafs Mushaf word pages', chapters, ayahs },
    layout: ayahs.map(row => verses.get(`${row.surah}:${row.ayah}`)) };
}

export async function readPackagedQuranReference() {
  const metadata = JSON.parse(await readFile(new URL('../data/quran-pages.json', import.meta.url), 'utf8'));
  const pages = [];
  for (let start = 1; start <= 604; start += 20) {
    pages.push(...await Promise.all(Array.from({ length: Math.min(20, 605 - start) }, (_, index) =>
      readFile(new URL(`../../public/quran/hafs/pages/${start + index}.json`, import.meta.url), 'utf8').then(JSON.parse))));
  }
  return buildPackagedQuranReference(pages, metadata);
}
