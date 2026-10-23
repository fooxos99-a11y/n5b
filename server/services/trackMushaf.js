import { readQuranRange } from './quranReferenceCache.js';
import { readLocalMushafPage } from './localMushaf.js';
import { normalizeSelectedWordMarks } from './recitationMarks.js';
import { trackWordMarkCounts } from '../../shared/track-word-marks.js';

const position = (surah, ayah) => Number(surah) * 1000 + Number(ayah);
const invalid = message => Object.assign(new Error(message), { status: 422, statusCode: 422 });

/** Resolve the signed verse range against the packaged, shared Mushaf word reference. */
export async function loadTrackMushaf(connection, range) {
  const first = position(range.fromSurah, range.fromAyah), last = position(range.toSurah, range.toAyah);
  const ayahs = (await readQuranRange(connection, 1, 604)).filter(ayah => {
    const value = position(ayah.surah, ayah.ayah);
    return value >= first && value <= last;
  });
  const allowed = new Set(ayahs.map(ayah => `${ayah.surah}:${ayah.ayah}`));
  // QCF page boundaries can differ from verse pagination by one page.
  const pageNumbers = [...new Set(ayahs.flatMap(ayah => [ayah.page - 1, ayah.page, ayah.page + 1]))]
    .filter(page => page >= 1 && page <= 604).sort((a, b) => a - b);
  const pages = (await Promise.all(pageNumbers.map(readLocalMushafPage)))
    .filter(page => page?.words.some(word => word.charType === 'word' && allowed.has(word.verseKey)));
  if (!pages.length) throw invalid('تعذر تحميل كلمات المقطع. حاول مرة أخرى.');
  return { pages, allowedRange: range, wordMarks: [] };
}

export async function normalizeTrackSegmentMarks(connection, segments) {
  return Promise.all(segments.map(async segment => {
    if (segment.wordMarks === undefined) return segment;
    if (!Array.isArray(segment.wordMarks) || segment.wordMarks.length > 1000) throw invalid('علامات المقطع غير صحيحة.');
    if (!segment.wordMarks.length) return { ...segment, wordMarks: [] };
    const data = await loadTrackMushaf(connection, segment.range);
    const words = data.pages.flatMap(page => page.words).filter(word => word.charType === 'word');
    const first = position(segment.range.fromSurah, segment.range.fromAyah), last = position(segment.range.toSurah, segment.range.toAyah);
    const allowedByKey = new Set(words.filter(word => {
      const [surah, ayah] = word.verseKey.split(':');
      const value = position(surah, ayah);
      return value >= first && value <= last;
    }).map(word => word.verseKey));
    const normalizedWordMarks = [];
    normalizeSelectedWordMarks({ wordMarksPayload: segment.wordMarks, words,
      wordIndexByLocation: new Map(words.map((word, index) => [word.location, index])),
      allowedByKey, normalizedWordMarks, marksByKey: new Map() });
    const occupied = new Set();
    for (const mark of normalizedWordMarks) {
      const start = words.findIndex(word => word.location === mark.startLocation);
      const end = words.findIndex(word => word.location === mark.endLocation);
      for (const word of words.slice(start, end + 1)) {
        if (word.page !== mark.page || occupied.has(word.location)) throw invalid('علامات المقطع متداخلة أو خارج الصفحة.');
        occupied.add(word.location);
      }
    }
    const counts = trackWordMarkCounts(normalizedWordMarks);
    return { ...segment, wordMarks: normalizedWordMarks, ...Object.fromEntries(Object.entries(counts)
      .map(([key, value]) => [key, Math.max(value, segment[key])])) };
  }));
}
