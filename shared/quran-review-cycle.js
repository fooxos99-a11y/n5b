import { compareQuranPositionInDirection } from './quran-execution-policy.js';

export const MAX_REVIEW_FACES = 1208;
const key = ayah => `${ayah.surah}:${ayah.ayah}`;
const position = ayah => ({ page: Number(ayah.page), surah: Number(ayah.surah), ayah: Number(ayah.ayah), surahName: ayah.surahName });

// Keep occurrence order: the same ayah after a wrap is a different step.
export function buildReviewCycle({ ayahs, isAvailable, start, direction = 1 }) {
  const totals = new Map();
  for (const ayah of ayahs) totals.set(Number(ayah.page), (totals.get(Number(ayah.page)) || 0) + 1);
  const ordered = [...ayahs].sort((a, b) => compareQuranPositionInDirection(a, b, direction));
  const available = ordered.flatMap((ayah, index) => isAvailable(ayah)
    ? [{ ...position(ayah), weight: 1 / totals.get(Number(ayah.page)), ordinal: index }] : []);
  if (!available.length) return { ayahs: [], direction };
  let offset = available.findIndex(ayah => start && key(ayah) === key(start));
  if (offset < 0) offset = available.findIndex(ayah => compareQuranPositionInDirection(ayah, start || available[0], direction) >= 0);
  if (offset < 0) offset = 0;
  return { ayahs: [...available.slice(offset), ...available.slice(0, offset)], direction };
}

export function selectReviewFaces(cycle, faces) {
  const amount = Number(faces);
  if (!Number.isFinite(amount) || amount < 0.25 || amount > MAX_REVIEW_FACES) throw new RangeError('مقدار المراجعة غير صالح.');
  const ayahs = cycle?.ayahs || [];
  if (!ayahs.length) throw new RangeError('لا يوجد محفوظ متاح للمراجعة.');
  const ranges = [];
  let completed = 0, index = 0, previous = null;
  while (completed + 1e-8 < amount) {
    const ayah = ayahs[index % ayahs.length];
    const last = ranges.at(-1);
    if (last && previous && ayah.ordinal === previous.ordinal + 1) last.end = position(ayah);
    else ranges.push({ start: position(ayah), end: position(ayah) });
    completed += ayah.weight;
    previous = ayah;
    index += 1;
  }
  return { faces: amount, completedFaces: Math.round(completed * 10000) / 10000,
    ranges, next: position(ayahs[index % ayahs.length]), direction: cycle.direction };
}

export function reviewRangeLabel(range) {
  const label = value => `${value.surahName || 'سورة ' + value.surah} آية ${value.ayah}`;
  return `${label(range.start)} إلى ${label(range.end)}`;
}

export function parseReviewExecution(value) {
  if (!value) return null;
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  return Array.isArray(data?.ranges) && Number(data.faces) > 0 ? data : null;
}
