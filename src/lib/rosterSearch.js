const normalizeArabicPersonName = (value = '') => String(value)
  .normalize('NFKD')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replaceAll('ى', 'ي')
  .replaceAll('ة', 'ه')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

export function filterRosterByName(rows, search) {
  const terms = normalizeArabicPersonName(search).split(' ').filter(Boolean);
  return rows.filter(row => {
    const name = normalizeArabicPersonName(row.name);
    return terms.every(term => name.includes(term));
  });
}
