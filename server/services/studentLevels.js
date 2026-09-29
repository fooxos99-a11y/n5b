import { readQuranRange } from './quranReferenceCache.js';
import { getBusinessDate } from '../../shared/business-date.js';
import { daysBetweenDates, resolveStudentLevel } from '../../shared/student-levels.js';

// Reference positions are immutable; each database connection owns its own index.
const indexes = new WeakMap();

/** Mushaf-order positions with the contiguous span of every surah and juz. */
export function buildQuranCoverageIndex(rows = []) {
  const position = new Map();
  const surahs = new Map();
  const juzs = new Map();
  rows.forEach((row, index) => {
    const surah = Number(row.surah);
    const juz = Number(row.juz);
    position.set(`${surah}:${Number(row.ayah)}`, index);
    const surahSpan = surahs.get(surah) || { first: index, last: index };
    surahSpan.last = index;
    surahs.set(surah, surahSpan);
    const juzSpan = juzs.get(juz) || { first: index, last: index, pages: new Set() };
    juzSpan.last = index;
    juzSpan.pages.add(Number(row.page));
    juzs.set(juz, juzSpan);
  });
  return {
    size: rows.length,
    position,
    surahs,
    juzs: new Map([...juzs].map(([juz, span]) => [juz, { first: span.first, last: span.last, pages: span.pages.size }])),
  };
}

async function coverageIndex(connection) {
  let pending = indexes.get(connection);
  if (!pending) {
    pending = readQuranRange(connection, 1, 604).then(buildQuranCoverageIndex);
    indexes.set(connection, pending);
    pending.catch(() => indexes.delete(connection));
  }
  return pending;
}

/**
 * Mushaf-order index spans covered by a memorized range. A range written from a later surah
 * to an earlier one follows the descending order: surahs backwards, each surah's ayahs forwards.
 */
export function rangeIntervals(index, range = {}) {
  const startSurah = Number(range.startSurah);
  const endSurah = Number(range.endSurah);
  const start = index.position.get(`${startSurah}:${Number(range.startAyah)}`);
  const end = index.position.get(`${endSurah}:${Number(range.endAyah)}`);
  if (start === undefined || end === undefined) return [];
  if (startSurah <= endSurah) return [[Math.min(start, end), Math.max(start, end)]];
  const intervals = [[start, index.surahs.get(startSurah).last]];
  for (let surah = startSurah - 1; surah > endSurah; surah -= 1) {
    const span = index.surahs.get(surah);
    if (span) intervals.push([span.first, span.last]);
  }
  intervals.push([index.surahs.get(endSurah).first, end]);
  return intervals;
}

/** Per juz: coverage and the first date all its verses were covered, ignoring later copies. */
export function studentJuzStatus(index, pieces = []) {
  const covered = new Uint8Array(index.size);
  const firstCoveredOn = Array(index.size).fill(null);
  const touched = pieces.map(({ range, date }) => ({ date: date || null, intervals: rangeIntervals(index, range) }));
  for (const { date, intervals } of touched) {
    for (const [first, last] of intervals) {
      covered.fill(1, first, last + 1);
      if (!date) continue;
      for (let position = first; position <= last; position += 1) {
        if (!firstCoveredOn[position] || date < firstCoveredOn[position]) firstCoveredOn[position] = date;
      }
    }
  }
  const status = new Map();
  for (const [juz, span] of index.juzs) {
    let count = 0;
    for (let position = span.first; position <= span.last; position += 1) count += covered[position];
    let completedOn = null;
    for (let position = span.first; position <= span.last; position += 1) {
      const date = firstCoveredOn[position];
      if (date && (!completedOn || date > completedOn)) completedOn = date;
    }
    status.set(juz, { total: span.last - span.first + 1, covered: count, pages: span.pages, completedOn });
  }
  return status;
}

const businessDateOf = (value) => {
  if (!value) return null;
  return getBusinessDate(value instanceof Date ? value : new Date(value)) || null;
};

const laterDate = (first, second) => (!first ? second : !second ? first : (first > second ? first : second));

/**
 * Current level of every student matched by `scope`, with the days spent in it.
 * `scope.filter(column)` returns the SQL restriction and `scope.params` its values; `query`
 * runs parameterized SQL and `acceptedSql(alias)` is the accepted-memorization condition.
 */
export async function loadStudentLevels({ query, referenceConnection, scope, acceptedSql, today = getBusinessDate() }) {
  const params = scope.params || [];
  const [students] = await query(`
    SELECT s.id, s.name, s.created_at AS createdAt, c.name AS committeeName
    FROM students s
    LEFT JOIN committees c ON c.id = s.committee_id
    WHERE ${scope.filter('s.id')}
    ORDER BY s.name ASC
  `, params);
  if (!students.length) return [];
  const [[prior], [tasks], index] = await Promise.all([
    query(`
      SELECT student_id AS studentId, start_surah AS startSurah, start_ayah AS startAyah,
        end_surah AS endSurah, end_ayah AS endAyah, created_at AS createdAt
      FROM student_quran_plan_prior_memorization
      WHERE ${scope.filter('student_id')}
      UNION ALL
      SELECT student_id AS studentId, start_surah AS startSurah, start_ayah AS startAyah,
        end_surah AS endSurah, end_ayah AS endAyah, created_at AS createdAt
      FROM student_quran_prior_memorization
      WHERE ${scope.filter('student_id')}
    `, [...params, ...params]),
    query(`
      SELECT t.student_id AS studentId, t.from_surah AS startSurah, t.from_ayah AS startAyah,
        COALESCE(t.actual_to_surah, t.to_surah) AS endSurah,
        COALESCE(t.actual_to_ayah, t.to_ayah) AS endAyah,
        DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate
      FROM student_quran_tasks t
      WHERE t.task_type = 'memorization' AND ${acceptedSql('t')}
        AND t.from_surah IS NOT NULL AND t.from_ayah IS NOT NULL
        AND t.to_surah IS NOT NULL AND t.to_ayah IS NOT NULL
        AND ${scope.filter('t.student_id')}
    `, params),
    coverageIndex(referenceConnection),
  ]);
  const piecesByStudent = new Map();
  const addPiece = (studentId, range, date) => {
    const key = String(studentId);
    if (!piecesByStudent.has(key)) piecesByStudent.set(key, []);
    piecesByStudent.get(key).push({ range, date });
  };
  for (const row of prior) addPiece(row.studentId, row, businessDateOf(row.createdAt));
  for (const row of tasks) addPiece(row.studentId, row, row.taskDate || null);

  return students.map((student) => {
    const level = resolveStudentLevel(studentJuzStatus(index, piecesByStudent.get(String(student.id)) || []));
    const joined = businessDateOf(student.createdAt);
    const since = laterDate(level.since, joined) || today;
    return {
      id: Number(student.id),
      name: student.name,
      committeeName: student.committeeName || '',
      level: { key: level.key, name: level.name, progressPercent: level.progressPercent, finished: level.finished },
      since,
      days: daysBetweenDates(since, today),
    };
  });
}
