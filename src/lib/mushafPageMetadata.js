import { hizbOfAyah, hizbOfPage } from '../../shared/quran-hizbs.js';
import { toArabicIndicDigits } from '../../shared/quranSelectionText.js';

export { toArabicIndicDigits as formatMushafNumber };

export function getMushafPageMetadata(page, index, fallbackName = '') {
  const [surah, ayah] = String(page?.words?.[0]?.verseKey || page?.words?.[0]?.location || '').split(':').map(Number);
  const hizb = surah > 0 && ayah > 0 ? hizbOfAyah(surah, ayah) : hizbOfPage(page?.page || 1);
  const chapter = index?.chapters?.find((item) => Number(item.number) === surah);
  return {
    surahName: chapter?.name || fallbackName || page?.decorations?.find((item) => item.type === 'surah')?.name || '',
    hizb,
    juz: Math.ceil(hizb / 2),
  };
}
