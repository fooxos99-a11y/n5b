import { compareQuranPositionInDirection as compare } from '../../shared/quran-execution-policy.js';

// Ranges are canonical, as returned by getStudentMemorizedRanges.
export function findNextUnmemorizedPosition({ ayahs, ranges, start, end, direction = 1 }) {
  const bounds = ranges.map((range) => ({
    start: { page: range.startPage, surah: range.startSurah, ayah: range.startAyah },
    end: { page: range.endPage, surah: range.endSurah, ayah: range.endAyah },
  }));
  const next = [...ayahs]
    .filter((ayah) => compare(ayah, start, direction) >= 0 && compare(ayah, end, direction) <= 0)
    .sort((a, b) => compare(a, b, direction))
    .find((ayah) => !bounds.some((range) => compare(ayah, range.start) >= 0 && compare(ayah, range.end) <= 0));
  return next ? { page: Number(next.page), surah: Number(next.surah), ayah: Number(next.ayah) } : null;
}
