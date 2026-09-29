// Starting ayah of each of the 60 ahzab in the Madani mushaf (Hafs). Two ahzab make one juz.
export const HIZB_STARTS = Object.freeze([
  [1, 1], [2, 75], [2, 142], [2, 203], [2, 253], [3, 15], [3, 93], [3, 171], [4, 24], [4, 88],
  [4, 148], [5, 27], [5, 82], [6, 36], [6, 111], [7, 1], [7, 88], [7, 171], [8, 41], [9, 34],
  [9, 93], [10, 26], [11, 6], [11, 84], [12, 53], [13, 19], [15, 1], [16, 51], [17, 1], [17, 99],
  [18, 75], [19, 59], [21, 1], [22, 1], [23, 1], [24, 21], [25, 21], [26, 111], [27, 56], [28, 51],
  [29, 46], [31, 22], [33, 31], [34, 24], [36, 28], [37, 145], [39, 32], [40, 41], [41, 47], [43, 24],
  [46, 1], [48, 18], [51, 31], [55, 1], [58, 1], [62, 1], [67, 1], [72, 1], [78, 1], [87, 1],
].map(([surah, ayah], index) => Object.freeze({ number: index + 1, surah, ayah })));

export const HIZB_COUNT = HIZB_STARTS.length;

const compareAyah = (left, right) => (left.surah - right.surah) || (left.ayah - right.ayah);

export function hizbOfAyah(surah, ayah) {
  const target = { surah: Number(surah), ayah: Number(ayah) };
  let low = 0;
  let high = HIZB_STARTS.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (compareAyah(HIZB_STARTS[middle], target) <= 0) low = middle;
    else high = middle - 1;
  }
  return HIZB_STARTS[low].number;
}

/**
 * Splits an ordered list of ayahs into consecutive hizb units.
 * @param {{surah:number, ayah:number}[]} ayahs ayahs in mushaf order (may span several ranges)
 * @returns {{hizb:number, ayahs:{surah:number, ayah:number}[]}[]}
 */
export function groupAyahsByHizb(ayahs = []) {
  const units = [];
  for (const item of ayahs) {
    const hizb = hizbOfAyah(item.surah, item.ayah);
    const last = units.at(-1);
    if (last && last.hizb === hizb) last.ayahs.push(item);
    else units.push({ hizb, ayahs: [item] });
  }
  return units;
}

// First mushaf page of each hizb (the page holding its starting ayah), verified against the juz starts.
export const HIZB_START_PAGES = Object.freeze([
  1, 11, 22, 32, 42, 51, 62, 72, 82, 92, 102, 112, 121, 132, 142, 151, 162, 173, 182, 192,
  201, 212, 222, 231, 242, 252, 262, 272, 282, 292, 302, 309, 322, 332, 342, 352, 362, 371, 382, 392,
  402, 413, 422, 431, 442, 451, 462, 472, 482, 491, 502, 513, 522, 531, 542, 553, 562, 572, 582, 591,
]);

/** Hizb a whole page belongs to: the last hizb that starts on or before the page. */
export function hizbOfPage(page) {
  const target = Number(page);
  let hizb = 1;
  for (let index = 0; index < HIZB_START_PAGES.length; index += 1) {
    if (HIZB_START_PAGES[index] <= target) hizb = index + 1;
    else break;
  }
  return hizb;
}

/** Splits consecutive page ranges at hizb starts so every piece belongs to exactly one hizb. */
export function splitPageRangesByHizb(ranges = []) {
  const pieces = [];
  for (const range of ranges) {
    let fromPage = Number(range.fromPage);
    const toPage = Number(range.toPage);
    while (fromPage <= toPage) {
      const hizb = hizbOfPage(fromPage);
      const nextStart = HIZB_START_PAGES[hizb] ?? Infinity;
      const pieceEnd = Math.min(toPage, nextStart - 1);
      pieces.push({ fromPage, toPage: pieceEnd, hizb });
      fromPage = pieceEnd + 1;
    }
  }
  return pieces;
}

/**
 * Picks review pages covering a number of whole ahzab from the available pages, starting at the review cursor.
 * Like page picking, it wraps around once and never crosses a second gap.
 */
export function pickReviewPagesByHizbs(availablePages, startPage, hizbCount) {
  const sorted = [...availablePages].map(Number).sort((a, b) => a - b);
  const wanted = Math.max(0, Math.floor(Number(hizbCount) || 0));
  if (!sorted.length || wanted < 1) return { pages: [], nextReviewPage: startPage, hizbs: [] };
  const startIndex = sorted.findIndex(page => page >= Number(startPage));
  const ordered = startIndex >= 0 ? [...sorted.slice(startIndex), ...sorted.slice(0, startIndex)] : sorted;
  const picked = [];
  const hizbs = [];
  let segments = 0;
  for (const page of ordered) {
    const hizb = hizbOfPage(page);
    if (!hizbs.includes(hizb)) {
      if (hizbs.length >= wanted) break;
      hizbs.push(hizb);
    }
    const previous = picked.at(-1);
    const wrappedToStart = previous && page === sorted[0] && previous === sorted.at(-1);
    if (previous && (wrappedToStart || page !== previous + 1)) {
      segments += 1;
      if (segments > 1) break;
    }
    picked.push(page);
  }
  const lastPicked = picked.at(-1);
  const nextReviewPage = lastPicked ? (sorted.find(page => page > lastPicked) || sorted[0]) : (sorted[0] || startPage);
  return { pages: picked, nextReviewPage, hizbs: [...new Set(picked.map(hizbOfPage))] };
}
