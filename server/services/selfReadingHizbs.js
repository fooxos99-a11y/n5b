import { HIZB_STARTS, HIZB_COUNT } from '../../shared/quran-hizbs.js';
import { measureQuranFaces, quranFacePositions } from './quranFaceMeasurement.js';

const ayahIndex = new Map(quranFacePositions.map((row, index) => [`${row.surah}:${row.ayah}`, index]));

/** Whole Quran ahzab; never infer them by dividing a page count by ten. */
export function resolveReadingHizbs(from, to) {
  const fromHizb = Number(from), toHizb = Number(to);
  if (!Number.isInteger(fromHizb) || !Number.isInteger(toHizb) || fromHizb < 1 || toHizb > HIZB_COUNT || fromHizb > toHizb) {
    throw Object.assign(new Error('اختر نطاقًا صحيحًا من أحزاب القرآن.'), { status: 422 });
  }
  const start = HIZB_STARTS[fromHizb - 1];
  const next = HIZB_STARTS[toHizb];
  const end = next ? quranFacePositions[ayahIndex.get(`${next.surah}:${next.ayah}`) - 1] : quranFacePositions.at(-1);
  const range = { startSurah: start.surah, startAyah: start.ayah, endSurah: end.surah, endAyah: end.ayah };
  return { fromHizb, toHizb, hizbCount: toHizb - fromHizb + 1, range,
    faces: measureQuranFaces(start, end) };
}
