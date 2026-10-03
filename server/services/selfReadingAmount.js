import { acceptedQuranExecutionSql, quranFacePositions } from './quranFaceMeasurement.js';
import { readQuranRange } from './quranReferenceCache.js';
import { hizbOfAyah } from '../../shared/quran-hizbs.js';

const positions = new Map(quranFacePositions.map(row => [`${row.surah}:${row.ayah}`, row]));
const keyOf = row => `${row.surah}:${row.ayah}`;
const contains = (range, row) => {
  const startSurah = Number(range.startSurah), endSurah = Number(range.endSurah);
  if (startSurah <= endSurah) {
    const value = row.surah * 1000 + row.ayah;
    return value >= startSurah * 1000 + Number(range.startAyah) && value <= endSurah * 1000 + Number(range.endAyah);
  }
  return row.surah <= startSurah && row.surah >= endSurah
    && (row.surah !== startSurah || row.ayah >= Number(range.startAyah))
    && (row.surah !== endSurah || row.ayah <= Number(range.endAyah));
};
const parseDetail = raw => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
};

/** Starts at the oldest saved material and continues independently of review; gaps stay separate. */
export function resolveMemorizedReading({ ayahs, memorized, faces, hizbs = null, direction = 1, previous = null }) {
  const available = ayahs.filter(row => memorized.some(range => contains(range, row)))
    .sort((a, b) => direction * (a.surah - b.surah) || a.ayah - b.ayah);
  if (!available.length) return { faces: 0, hizbCount: 0, ranges: [], range: null, cursor: null };
  const previousIndex = previous ? available.findIndex(row => keyOf(row) === previous) : -1;
  const ordered = [...available.slice(previousIndex + 1), ...available.slice(0, previousIndex + 1)];
  const pageLines = new Map();
  for (const row of ayahs) {
    const position = positions.get(keyOf(row));
    if (!position) continue;
    const lines = pageLines.get(row.page) || new Set();
    for (let line = position.forwardStart; line <= position.forwardEnd; line++) lines.add(line);
    pageLines.set(row.page, lines);
  }
  const selected = [], selectedLines = new Map(), selectedHizbs = new Set();
  let selectedFaces = 0;
  for (const row of ordered) {
    const position = positions.get(keyOf(row));
    if (!position) continue;
    const hizb = hizbOfAyah(row.surah, row.ayah);
    if (hizbs && !selectedHizbs.has(hizb) && selectedHizbs.size >= hizbs) break;
    const lines = selectedLines.get(row.page) || new Set();
    const nextLines = new Set(lines);
    for (let line = position.forwardStart; line <= position.forwardEnd; line++) nextLines.add(line);
    const nextFaces = selectedFaces + (nextLines.size - lines.size) / pageLines.get(row.page).size;
    if (!hizbs && nextFaces > Number(faces) + 0.00001 && selected.length) break;
    selected.push(row);
    selectedHizbs.add(hizb);
    selectedLines.set(row.page, nextLines);
    selectedFaces = nextFaces;
    if (!hizbs && selectedFaces >= Number(faces) - 0.00001) break;
  }
  const ranges = [];
  for (const row of selected) {
    const last = ranges.at(-1);
    if (last && last.endSurah === row.surah && last.endAyah + 1 === row.ayah) {
      last.endAyah = row.ayah; last.endPage = row.page;
    } else ranges.push({ startSurah: row.surah, startAyah: row.ayah, startPage: row.page,
      endSurah: row.surah, endAyah: row.ayah, endPage: row.page,
      startSurahName: row.surahName, endSurahName: row.surahName });
  }
  const first = selected[0], last = selected.at(-1);
  return { faces: Math.max(0.25, Math.round(selectedFaces * 4) / 4), hizbCount: selectedHizbs.size,
    fromHizb: first ? hizbOfAyah(first.surah, first.ayah) : null, toHizb: last ? hizbOfAyah(last.surah, last.ayah) : null,
    ranges, range: ranges.length === 1 ? ranges[0] : null, cursor: last ? keyOf(last) : null };
}

export async function loadMemorizedReading(connection, { studentId, date, faces, hizbs, direction }) {
  const [memorized] = await connection.query(`
    SELECT start_surah AS startSurah, start_ayah AS startAyah, end_surah AS endSurah, end_ayah AS endAyah
    FROM student_quran_plan_prior_memorization WHERE student_id = ?
    UNION ALL SELECT start_surah, start_ayah, end_surah, end_ayah FROM student_quran_prior_memorization WHERE student_id = ?
    UNION ALL SELECT t.from_surah, t.from_ayah, COALESCE(t.actual_to_surah, t.to_surah), COALESCE(t.actual_to_ayah, t.to_ayah)
    FROM student_quran_tasks t WHERE t.student_id = ? AND t.task_type = 'memorization'
      AND t.task_date <= ? AND ${acceptedQuranExecutionSql('t')}`, [studentId, studentId, studentId, date]);
  const [[prior]] = await connection.query(`SELECT detail_json AS detail FROM student_daily_grades
    WHERE student_id = ? AND component = 'reading' AND passed = 1 AND grade_date < ? ORDER BY grade_date DESC LIMIT 1`, [studentId, date]);
  return resolveMemorizedReading({ ayahs: await readQuranRange(connection, 1, 604), memorized,
    faces, hizbs, direction, previous: parseDetail(prior?.detail)?.readingCursor });
}
