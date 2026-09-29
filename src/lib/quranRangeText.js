const numberText = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');

export const formatQuranRangeText = (range = {}) => {
  const startName = range.startSurahName || (range.startSurah ? `سورة ${numberText(range.startSurah)}` : '');
  const endName = range.endSurahName || (range.endSurah ? `سورة ${numberText(range.endSurah)}` : startName);
  const startAyah = Number(range.startAyah || 0);
  const endAyah = Number(range.endAyah || 0);
  if (startName && startAyah && endAyah) {
    return Number(range.startSurah) === Number(range.endSurah)
      ? `${startName}، من آية ${numberText(startAyah)} إلى ${numberText(endAyah)}`
      : `${startName} آية ${numberText(startAyah)} إلى ${endName} آية ${numberText(endAyah)}`;
  }
  if (range.startPage && range.endPage) {
    return `من صفحة ${numberText(range.startPage)} إلى ${numberText(range.endPage)}`;
  }
  return '—';
};
