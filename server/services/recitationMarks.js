import { formatQuranSelectionText } from '../../shared/quranSelectionText.js';
import { isMistakeMark, RECITATION_MARK_TYPES } from '../../shared/recitation-mark-types.js';

/** Validate recitation marks against the authoritative task range before persistence. */
export function normalizeWordMarkType(mark) {
  if (RECITATION_MARK_TYPES.includes(mark?.markType)) return mark.markType;
  return null;
}

/** Validate recitation marks against the authoritative task range before persistence. */
export function normalizeSelectedAyahMarks(ayahMarksPayload, allowedByKey, marksByKey, markLimit) {
  for (const rawMark of ayahMarksPayload) {
    const surah = Number(rawMark?.surah || 0);
    const ayah = Number(rawMark?.ayah || 0);
    const key = `${surah}:${ayah}`;
    if (!allowedByKey.has(key)) {
      throw Object.assign(new Error('إحدى الآيات المحددة خارج المقدار الذي سمعه الطالب.'), { statusCode: 422 });
    }
    const rawMistakeCount = Number(rawMark?.mistakeCount || 0);
    const rawWarningCount = Number(rawMark?.warningCount || 0);
    if (!Number.isFinite(rawMistakeCount) || !Number.isFinite(rawWarningCount)) {
      throw Object.assign(new Error('عدد الأخطاء أو التنبيهات غير صحيح.'), { statusCode: 422 });
    }
    const current = marksByKey.get(key) || { surah, ayah, mistakeCount: 0, warningCount: 0 };
    current.mistakeCount += Math.max(0, Math.min(markLimit, Math.trunc(rawMistakeCount)));
    current.warningCount += Math.max(0, Math.min(markLimit, Math.trunc(rawWarningCount)));
    marksByKey.set(key, current);
  }
}

/** Validate recitation marks against the authoritative task range before persistence. */
export function normalizeSelectedWordMarks({ wordMarksPayload, wordIndexByLocation, words, allowedByKey, normalizedWordMarks, marksByKey }) {
  for (const rawMark of wordMarksPayload) {
    const startIndex = wordIndexByLocation.get(String(rawMark?.startLocation || ''));
    const endIndex = wordIndexByLocation.get(String(rawMark?.endLocation || ''));
    const markType = normalizeWordMarkType(rawMark);
    if (startIndex === undefined || endIndex === undefined || !markType) {
      throw Object.assign(new Error('تحديد الكلمات غير صحيح.'), { statusCode: 422 });
    }
    const fromIndex = Math.min(startIndex, endIndex);
    const toIndex = Math.max(startIndex, endIndex);
    const selectedWords = words.slice(fromIndex, toIndex + 1);
    const outsideTask = selectedWords.some((word) => !allowedByKey.has(word.verseKey));
    if (outsideTask) {
      throw Object.assign(new Error('إحدى الكلمات المحددة خارج المقدار الذي سمعه الطالب.'), { statusCode: 422 });
    }
    const startWord = words[fromIndex];
    const endWord = words[toIndex];
    const [startSurah, startAyah] = startWord.verseKey.split(':').map(Number);
    const [endSurah, endAyah] = endWord.verseKey.split(':').map(Number);
    const selectedText = formatQuranSelectionText(selectedWords).slice(0, 1000);
    normalizedWordMarks.push({
      page: Number(startWord.page),
      startSurah,
      startAyah,
      startWordPosition: Number(startWord.position),
      endSurah,
      endAyah,
      endWordPosition: Number(endWord.position),
      startLocation: startWord.location,
      endLocation: endWord.location,
      selectedText,
      markType,
      notes: String(rawMark?.notes || '').trim().slice(0, 500),
    });
    const key = `${startSurah}:${startAyah}`;
    const current = marksByKey.get(key) || { surah: startSurah, ayah: startAyah, mistakeCount: 0, warningCount: 0 };
    if (isMistakeMark(markType)) current.mistakeCount += 1;
    else current.warningCount += 1;
    marksByKey.set(key, current);
  }
}

