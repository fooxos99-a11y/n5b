const normalizeJuzNumber = (value) => {
  const juz = Number(value);
  return Number.isInteger(juz) && juz >= 1 && juz <= 30 ? juz : null;
};

const groupJuzNumbers = (values = []) => {
  const juzs = [...new Set(values.map(normalizeJuzNumber).filter(Boolean))].sort((first, second) => first - second);
  return juzs.reduce((ranges, juz) => {
    const last = ranges.at(-1);
    if (last && juz === last.endJuz + 1) {
      last.endJuz = juz;
    } else {
      ranges.push({ startJuz: juz, endJuz: juz });
    }
    return ranges;
  }, []);
};

export const mergeJuzRanges = (ranges = []) => groupJuzNumbers(
  ranges.flatMap(({ startJuz, endJuz }) => {
    const start = normalizeJuzNumber(startJuz);
    const end = normalizeJuzNumber(endJuz);
    if (!start || !end || start > end) return [];
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  })
);

export const expandJuzRanges = (ranges = []) => mergeJuzRanges(ranges).flatMap(({ startJuz, endJuz }) => (
  Array.from({ length: endJuz - startJuz + 1 }, (_, index) => startJuz + index)
));

export const formatJuzRange = ({ startJuz, endJuz }, formatNumber = String) => (
  startJuz === endJuz
    ? `الجزء ${formatNumber(startJuz)}`
    : `من الجزء ${formatNumber(startJuz)} إلى الجزء ${formatNumber(endJuz)}`
);

export const formatJuzNumbers = (values = [], formatNumber = String) => (
  groupJuzNumbers(values).map((range) => formatJuzRange(range, formatNumber)).join('، ')
);
