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
  const stageJuz = Number(input?.stageJuz);
  return rangeFromAyahs([start, end], { ...(label ? { label } : {}),
    ...(Number.isInteger(stageJuz) && stageJuz >= 2 && stageJuz <= 30 && stageJuz % 2 === 0 ? { stageJuz } : {}) });
}

export function traverseAutomaticRange(ayahs, range) {
  const start = boundary(range, 'start'), end = boundary(range, 'end');
  const direction = start.surah > end.surah ? -1 : 1;
  return ayahs.filter(row => compare(row, start, direction) >= 0 && compare(row, end, direction) <= 0)
    .sort((a, b) => compare(a, b, direction));
}

export function defaultAutomaticTemplate(ayahs) {
  const ranges = [], assigned = new Set();
  const ordered = [...ayahs].sort((a, b) => b.surah - a.surah || a.ayah - b.ayah);
  for (let high = 30; high >= 2; high -= 2) {
    const target = ordered.filter(row => row.juz === high || row.juz === high - 1);
    if (!target.length) throw invalid('تعذر تحميل حدود أجزاء المصحف. أعد المحاولة.');
    const surahs = new Set(target.map(row => row.surah));
    const rows = ordered.filter(row => surahs.has(row.surah) && !assigned.has(row.surah));
    for (const row of rows) assigned.add(row.surah);
    if (rows.length) ranges.push(rangeFromAyahs(rows, { label: `الجزآن ${high} و${high - 1}`, stageJuz: high }));
  }
  return { name: 'جزآن من 30 إلى 1', revision: 0, ranges };
}

/** Rebuild only recognized automatic stages; manual queues and custom templates retain their exact order. */
export function coalesceAutomaticStages(ayahs, ranges) {
  const stages = new Map();
  for (const range of ranges) {
    const match = /^الجزآن (\d+) و(\d+)$/.exec(range.label || '');
    const high = Number(range.stageJuz || match?.[1]);
    if (range.automatic !== true || !match || high !== Number(match[1]) || Number(match[2]) !== high - 1
      || high < 2 || high > 30 || high % 2 !== 0) return ranges;
    const rows = traverseAutomaticRange(ayahs, resolveAutomaticRange(ayahs, range));
    if (!rows.length || rows.some(row => ![high, high - 1].includes(row.juz)) && !range.stageJuz) return ranges;
    const entry = stages.get(high) || new Set();
    rows.forEach(row => entry.add(row.surah));
    stages.set(high, entry);
  }
  const assigned = new Set(), result = [];
  const ordered = [...ayahs].sort((a, b) => b.surah - a.surah || a.ayah - b.ayah);
  for (const [high, surahs] of stages) {
    const rows = ordered.filter(row => surahs.has(row.surah) && !assigned.has(row.surah));
    rows.forEach(row => assigned.add(row.surah));
    if (rows.length) result.push(rangeFromAyahs(rows, { label: `الجزآن ${high} و${high - 1}`, stageJuz: high }));
  }
  return result;
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
  let carry = [];
  for (const [index, raw] of ranges.entries()) {
    const range = resolveAutomaticRange(ayahs, raw);
    const rows = [...carry, ...traverseAutomaticRange(ayahs, range)];
    carry = [];
    const pending = rows.filter(row => !blocked.has(key(row)) && !occupied.has(key(row)));
    if (range.stageJuz && Number(ranges[index + 1]?.stageJuz) === range.stageJuz - 2
      && !pending.some(row => row.juz === range.stageJuz || row.juz === range.stageJuz - 1)) {
      carry = pending;
      stages.push({ ...range, totalAyahs: rows.length, excludedAyahs: rows.filter(row => blocked.has(key(row))).length,
        reservedAyahs: rows.filter(row => occupied.has(key(row))).length, advanceAyahs: 0, remainingAyahs: 0 });
      continue;
    }
    let segment = [], excluded = 0, held = 0;
    const close = () => {
      if (segment.length) result.push(rangeFromAyahs(segment, { automatic: true, ...(range.label ? { label: range.label } : {}),
        ...(range.stageJuz ? { stageJuz: range.stageJuz } : {}) }));
      segment = [];
    };
    for (const row of rows) {
      if (occupied.has(key(row))) { held++; close(); }
      else if (blocked.has(key(row))) { excluded++; if (!range.stageJuz) close(); }
      else { segment.push(row); occupied.add(key(row)); }
    }
    close();
    const advanceAyahs = range.stageJuz ? rows.filter(row => row.juz < range.stageJuz - 1).length : 0;
    stages.push({ ...range, totalAyahs: rows.length, excludedAyahs: excluded, reservedAyahs: held, advanceAyahs,
      remainingAyahs: rows.length - excluded - held });
  }
  if (result.length > MAX_AUTOMATIC_RANGES) throw invalid('المتبقي يتجاوز 100 مقطع. طبّق جزءًا من القالب أولًا.');
  return { ranges: result, stages, excludedAyahs: stages.reduce((sum, stage) => sum + stage.excludedAyahs, 0) };
}
