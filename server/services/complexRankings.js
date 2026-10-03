import { rankFamilies } from '../../shared/family-rankings.js';

/** Aggregate each circle once, even when it has several students. */
export async function loadComplexRankings(connection, mode) {
  const [rows] = await connection.query(`
    SELECT cx.id, cx.name, COALESCE(SUM(circle.points), 0) AS points,
      COALESCE(SUM(circle.studentPoints) / NULLIF(SUM(circle.studentsCount), 0), 0) AS averagePoints,
      COALESCE(SUM(circle.studentsCount), 0) AS studentsCount, COUNT(circle.id) AS committeesCount
    FROM complexes cx
    LEFT JOIN (
      SELECT c.id, c.complex_id, c.points, COUNT(s.id) AS studentsCount,
        COALESCE(SUM(GREATEST(0, COALESCE(s.points, 0))), 0) AS studentPoints
      FROM committees c LEFT JOIN students s ON s.committee_id = c.id
      GROUP BY c.id, c.complex_id, c.points
    ) circle ON circle.complex_id = cx.id
    GROUP BY cx.id, cx.name`);
  return rankFamilies(rows, mode).slice(0, 8).map(row => ({ ...row, id: Number(row.id), committeesCount: Number(row.committeesCount) }));
}
