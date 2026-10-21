import { memorizedSegments } from './memorizedSegments.js';
import { compareQuranPositionInDirection } from '../../shared/quran-execution-policy.js';

const positionKey = row => Number(row.surah) * 1000 + Number(row.ayah);
const toRanges = ayahs => memorizedSegments(ayahs, () => true).map(range => ({
  startPage: range.fromPage, startSurah: range.fromSurah, startAyah: range.fromAyah, startSurahName: range.fromSurahName,
  endPage: range.toPage, endSurah: range.toSurah, endAyah: range.toAyah, endSurahName: range.toSurahName,
}));

export function buildPassingParts(ayahs, ranges, type, juz) {
  const bounds = ranges.map(range => {
    const first = Number(range.startSurah) * 1000 + Number(range.startAyah);
    const last = Number(range.endSurah) * 1000 + Number(range.endAyah);
    return { start: Math.min(first, last), end: Math.max(first, last) };
  });
  const groups = new Map();
  for (const ayah of ayahs) {
    const number = Number(ayah.juz);
    if (type === 'branch' && juz !== undefined && number !== juz) continue;
    if (!groups.has(number)) groups.set(number, []);
    groups.get(number).push(ayah);
  }
  return [...groups].filter(([, items]) => items.every(ayah => bounds.some(range => positionKey(ayah) >= range.start && positionKey(ayah) <= range.end)))
    .map(([juzNumber, items]) => ({ juzNumber, ranges: toRanges(items) }));
}

export function buildBranchPassingParts(ayahs, tasks, juz) {
  // Descending plans traverse surahs backwards but ayahs within each surah forwards.
  const traversals = tasks.map(task => ({
    start: { page: Number(task.startPage), surah: Number(task.startSurah), ayah: Number(task.startAyah) },
    end: { page: Number(task.endPage), surah: Number(task.endSurah), ayah: Number(task.endAyah) },
    direction: Number(task.startSurah) < Number(task.endSurah) || (Number(task.startSurah) === Number(task.endSurah) && Number(task.startAyah) <= Number(task.endAyah)) ? 1 : -1,
  }));
  const saved = ayahs.filter(ayah => traversals.some(range => compareQuranPositionInDirection(ayah, range.start, range.direction) >= 0
    && compareQuranPositionInDirection(ayah, range.end, range.direction) <= 0));
  return buildPassingParts(ayahs, toRanges(saved), 'branch', juz);
}

/** Both types include recorded prior memorization and teacher-approved completed memorization across plans. */
export async function loadEligiblePassingParts(connection, { studentId, type, juz, loadMemorizedRanges, loadAyahs }) {
  if (!['branch', 'hafiz'].includes(type)) throw Object.assign(new Error('نوع الاجتياز غير صحيح.'), { status: 422 });
  const ayahs = await loadAyahs(connection);
  return buildPassingParts(ayahs, await loadMemorizedRanges(connection, studentId, { approvedOnly: true }), type, juz);
}
