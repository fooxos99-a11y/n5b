// Plan reference pages can differ from the QCF page actually containing an ayah.
export const resolveStudentMushafTarget = (target, index) => {
  if (!target) return null;
  const resolveRange = (item) => {
    const ayah = index?.ayahs?.find((entry) => Number(entry.surah) === Number(item.range?.fromSurah)
      && Number(entry.ayah) === Number(item.range?.fromAyah));
    return { ...item, page: ayah?.page ?? item.page };
  };
  return {
    ...resolveRange(target),
    ...(target.ranges ? { ranges: target.ranges.map(resolveRange) } : {}),
  };
};
