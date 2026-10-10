import { memorizedSegments } from './memorizedSegments.js';
import { currentQuranPlanSql } from './currentQuranPlan.js';
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

/** Branch passing credits only teacher-approved memorization in the current plan. */
export async function loadEligiblePassingParts(connection, { studentId, type, juz, loadMemorizedRanges, loadAyahs }) {
  if (!['branch', 'hafiz'].includes(type)) throw Object.assign(new Error('نوع الاجتياز غير صحيح.'), { status: 422 });
  const ayahs = await loadAyahs(connection);
  if (type === 'hafiz') return buildPassingParts(ayahs, await loadMemorizedRanges(connection, studentId, { approvedOnly: true }), type);
  const [tasks] = await connection.query(`SELECT t.from_page AS startPage, t.from_surah AS startSurah, t.from_ayah AS startAyah,
    COALESCE(t.actual_to_page,t.to_page) AS endPage, COALESCE(t.actual_to_surah,t.to_surah) AS endSurah,
    COALESCE(t.actual_to_ayah,t.to_ayah) AS endAyah
    FROM student_quran_tasks t JOIN student_quran_plans p ON p.id=t.plan_id AND p.student_id=t.student_id
    WHERE t.student_id=? AND t.task_type='memorization' AND t.teacher_completed=1 AND ${currentQuranPlanSql('p')}
      AND t.from_surah IS NOT NULL AND t.from_ayah IS NOT NULL AND t.to_surah IS NOT NULL AND t.to_ayah IS NOT NULL`, [studentId]);
  // Descending plans traverse surahs backwards but ayahs within each surah forwards.
  const traversals = tasks.map(task => ({
    start: { page: Number(task.startPage), surah: Number(task.startSurah), ayah: Number(task.startAyah) },
    end: { page: Number(task.endPage), surah: Number(task.endSurah), ayah: Number(task.endAyah) },
    direction: Number(task.startSurah) < Number(task.endSurah) || (Number(task.startSurah) === Number(task.endSurah) && Number(task.startAyah) <= Number(task.endAyah)) ? 1 : -1,
  }));
  const saved = ayahs.filter(ayah => traversals.some(range => compareQuranPositionInDirection(ayah, range.start, range.direction) >= 0
    && compareQuranPositionInDirection(ayah, range.end, range.direction) <= 0));
  return buildPassingParts(ayahs, toRanges(saved), type, juz);
}
