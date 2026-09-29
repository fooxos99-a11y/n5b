import { compareQuranPositionInDirection as compare } from '../../shared/quran-execution-policy.js';
import { measureQuranFaces, quranFacePositions } from './quranFaceMeasurement.js';

const positions = new Map(quranFacePositions.map(row => [`${row.surah}:${row.ayah}`, row]));
const startOf = range => ({ page: range.startPage, surah: range.startSurah, ayah: range.startAyah });
const endOf = range => ({ page: range.endPage, surah: range.endSurah, ayah: range.endAyah });
const roundFaces = lines => Math.max(0.25, Math.round(lines / 15 * 4) / 4);

/** Pick previous accepted verses in traversal order, then encode their exact canonical spans. */
export function selectExactQuranLinkRanges({ ayahs, ranges, current, direction, targetFaces, limitToTarget = false }) {
  const bounds = ranges.map(range => ({ start: startOf(range), end: endOf(range) }));
  const candidates = ayahs.map((ayah, index) => ({ ...ayah, index }))
    .filter(ayah => compare(ayah, current, direction) < 0
      && bounds.some(range => compare(ayah, range.start) >= 0 && compare(ayah, range.end) <= 0))
    .sort((a, b) => compare(b, a, direction));
  const covered = new Set();
  const selected = [];
  const target = Math.max(0.25, Number(targetFaces) || 1);
  for (const ayah of candidates) {
    const position = positions.get(`${ayah.surah}:${ayah.ayah}`);
    if (!position) continue;
    const lines = [];
    for (let line = position.reverseStart; line <= position.reverseEnd; line += 1) {
      if (!covered.has(line)) lines.push(line);
    }
    if (limitToTarget && roundFaces(covered.size + lines.length) > target) break;
    lines.forEach(line => covered.add(line));
    selected.push(ayah);
    if (roundFaces(covered.size) >= target) break;
  }
  selected.sort((a, b) => a.index - b.index);
  const groups = [];
  for (const ayah of selected) {
    const previous = groups.at(-1);
    if (previous && previous.end.index + 1 === ayah.index) previous.end = ayah;
    else groups.push({ start: ayah, end: ayah });
  }
  return groups.map(({ start, end }) => ({
    startPage: start.page, startSurah: start.surah, startAyah: start.ayah,
    endPage: end.page, endSurah: end.surah, endAyah: end.ayah,
    faces: measureQuranFaces(start, end),
  }));
}
