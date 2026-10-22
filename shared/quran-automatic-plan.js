import { compareQuranPositionInDirection as compare } from './quran-execution-policy.js';

export const AUTOMATIC_PLAN_KEY = 'quranAutomaticPlanTemplate';
export const MAX_AUTOMATIC_RANGES = 100;
const invalid = message => Object.assign(new Error(message), { status: 422, statusCode: 422 });
const key = row => `${Number(row.surah)}:${Number(row.ayah)}`;
const boundary = (range, side) => ({ surah: Number(range[`${side}Surah`]), ayah: Number(range[`${side}Ayah`]), page: Number(range[`${side}Page`]) });

export function rangeFromAyahs(rows, extra = {}) {
  const first = rows[0], last = rows.at(-1);
  return { ...extra, startSurah: first.surah, startAyah: first.ayah, startPage: first.page,
    endSurah: last.surah, endAyah: last.ayah, endPage: last.page };
}

export function resolveAutomaticRange(ayahs, input) {
  const endpoint = side => {
    const surah = Number(input?.[`${side}Surah`]), ayah = Number(input?.[`${side}Ayah`]);
    if (surah || ayah) return ayahs.find(row => row.surah === surah && row.ayah === ayah);
    const page = Number(input?.[`${side}Page`]);
    const rows = ayahs.filter(row => row.page === page);
    return side === 'start' ? rows[0] : rows.at(-1);
  };
  const start = endpoint('start'), end = endpoint('end');
  if (!start || !end || (start.surah === end.surah && start.ayah > end.ayah)) throw invalid('اختر بداية ونهاية صحيحتين لكل خطة.');
  const label = String(input?.label || '').trim().slice(0, 100);
  return rangeFromAyahs([start, end], label ? { label } : {});
}

export function traverseAutomaticRange(ayahs, range) {
  const start = boundary(range, 'start'), end = boundary(range, 'end');
  const direction = start.surah > end.surah ? -1 : 1;
  return ayahs.filter(row => compare(row, start, direction) >= 0 && compare(row, end, direction) <= 0)
    .sort((a, b) => compare(a, b, direction));
}

export function defaultAutomaticTemplate(ayahs) {
  const ranges = [];
  const ordered = [...ayahs].sort((a, b) => b.surah - a.surah || a.ayah - b.ayah);
  for (let high = 30; high >= 2; high -= 2) {
    let rows = [], found = false;
    const close = () => {
      if (rows.length) ranges.push(rangeFromAyahs(rows, { label: `الجزآن ${high} و${high - 1}` }));
      rows = [];
    };
    for (const row of ordered) {
      if (row.juz === high || row.juz === high - 1) { rows.push(row); found = true; }
      else close();
    }
    close();
    if (!found) throw invalid('تعذر تحميل حدود أجزاء المصحف. أعد المحاولة.');
  }
  return { name: 'جزآن من 30 إلى 1', revision: 0, ranges };
}

export function validateAutomaticTemplate(ayahs, input) {
  if (!input || !Array.isArray(input.ranges) || !input.ranges.length || input.ranges.length > MAX_AUTOMATIC_RANGES) throw invalid('أضف من خطة واحدة إلى 100 خطة في القالب.');
  const name = String(input.name || '').trim();
  if (!name || name.length > 100) throw invalid('أدخل اسمًا للقالب لا يتجاوز 100 حرف.');
  const occupied = new Set();
  const ranges = input.ranges.map(raw => {
    const range = resolveAutomaticRange(ayahs, raw);
    for (const row of traverseAutomaticRange(ayahs, range)) {
      if (occupied.has(key(row))) throw invalid('نطاقات القالب متداخلة. عدّل البداية أو النهاية.');
      occupied.add(key(row));
    }
    return range;
  });
  return { name, ranges };
}

/** Keep traversal order, including descending surahs with ascending ayahs within each surah. */
export function generateAutomaticRanges(ayahs, ranges, memorized = [], reserved = []) {
  const blocked = new Set(memorized.flatMap(range => traverseAutomaticRange(ayahs, resolveAutomaticRange(ayahs, range))).map(key));
  const occupied = new Set(reserved.flatMap(range => traverseAutomaticRange(ayahs, resolveAutomaticRange(ayahs, range))).map(key));
  const result = [], stages = [];
  for (const raw of ranges) {
    const range = resolveAutomaticRange(ayahs, raw);
    const rows = traverseAutomaticRange(ayahs, range);
    let segment = [], excluded = 0, held = 0;
    const close = () => {
      if (segment.length) result.push(rangeFromAyahs(segment, { automatic: true, ...(range.label ? { label: range.label } : {}) }));
      segment = [];
    };
    for (const row of rows) {
      if (blocked.has(key(row))) { excluded++; close(); }
      else if (occupied.has(key(row))) { held++; close(); }
      else { segment.push(row); occupied.add(key(row)); }
    }
    close();
    stages.push({ ...range, totalAyahs: rows.length, excludedAyahs: excluded, reservedAyahs: held,
      remainingAyahs: rows.length - excluded - held });
  }
  if (result.length > MAX_AUTOMATIC_RANGES) throw invalid('المتبقي يتجاوز 100 مقطع. طبّق جزءًا من القالب أولًا.');
  return { ranges: result, stages, excludedAyahs: stages.reduce((sum, stage) => sum + stage.excludedAyahs, 0) };
}
