const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export const toArabicIndicDigits = (value) => String(value).replace(/\d/g, (digit) => ARABIC_INDIC_DIGITS[Number(digit)]);

const getVerseKey = (word) => String(word?.verseKey || word?.location || '').split(':').slice(0, 2).join(':');

const getVerseNumber = (word) => {
  const verseKey = getVerseKey(word);
  const verseNumber = Number(verseKey.split(':')[1]);
  return Number.isInteger(verseNumber) && verseNumber > 0 ? verseNumber : null;
};

export const formatQuranSelectionText = (words = []) => {
  const selectedWords = words.filter((word) => word?.charType === 'word' && word?.textQpcHafs);
  const parts = [];

  selectedWords.forEach((word, index) => {
    const previousWord = selectedWords[index - 1];
    if (previousWord && getVerseKey(previousWord) !== getVerseKey(word)) {
      const previousVerseNumber = getVerseNumber(previousWord);
      if (previousVerseNumber) parts.push(`﴿${toArabicIndicDigits(previousVerseNumber)}﴾`);
    }
    parts.push(word.textQpcHafs);
  });

  return parts.join(' ');
};
