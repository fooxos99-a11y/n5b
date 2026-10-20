import { readFileSync } from 'node:fs';
import layout from '../data/quranVerseLineLayout.js';

const reference = JSON.parse(readFileSync(new URL('../data/quran-pages.json', import.meta.url), 'utf8'));
const byVerse = new Map(reference.ayahs.map(row => [`${row.surah}:${row.ayah}`, row]));
const ends = new Map(layout.map(([key, , , page]) => [key, page]));
const pages = new Map();
for (const row of reference.ayahs) {
  const page = pages.get(row.page) || { first: row, last: row, reverseFirst: row, reverseLast: row };
  page.last = row;
  if (row.surah > page.reverseFirst.surah) page.reverseFirst = row;
  if (row.surah === page.reverseLast.surah) page.reverseLast = row;
  pages.set(row.page, page);
}
const key = (surah, ayah) => `${Number(surah)}:${Number(ayah)}`;

export function canonicalQuranRange(range) {
  const start = byVerse.get(key(range.startSurah, range.startAyah));
  const end = byVerse.get(key(range.endSurah, range.endAyah));
  return { ...range, startPage: start?.page ?? range.startPage,
    endPage: end ? ends.get(key(end.surah, end.ayah)) : range.endPage };
}

/** Normalize presentation coordinates without rewriting accepted verse ranges. */
export function canonicalQuranRow(row, prefixes = ['from', 'to', 'actualTo', 'normalTo', 'scheduledTo']) {
  const result = { ...row };
  for (const prefix of prefixes) {
    const verse = byVerse.get(key(row[`${prefix}Surah`], row[`${prefix}Ayah`]));
    if (verse) result[`${prefix}Page`] = /^(?:to|actualTo|normalTo|scheduledTo|end)$/.test(prefix)
      ? ends.get(key(verse.surah, verse.ayah)) : verse.page;
  }
  return result;
}

export function quranFacePortion(row) {
  const start = byVerse.get(key(row.fromSurah, row.fromAyah));
  const end = byVerse.get(key(row.toSurah, row.toAyah));
  if (!start || !end || start.page !== end.page) return null;
  const page = pages.get(start.page);
  const first = start.surah > end.surah ? page.reverseFirst : page.first;
  const last = start.surah > end.surah ? page.reverseLast : page.last;
  const beginsAtStart = key(start.surah, start.ayah) === key(first.surah, first.ayah);
  const endsAtEnd = key(end.surah, end.ayah) === key(last.surah, last.ayah);
  if (beginsAtStart && endsAtEnd) return null;
  return !beginsAtStart && endsAtEnd ? 'remainder' : 'partial';
}

export function taskFaceQuantity(row, requested, measured) {
  return quranFacePortion(row) && Number(requested) >= 1
    ? Math.min(0.75, Math.max(0.25, Number(measured || 0.25)))
    : Number(requested) > 0 ? Number(requested) : Number(measured);
}
