import { assignRankingPositions } from './ranking-positions.js';
export const normalizeFamilyRankingMode = (value) => (value === 'average' ? 'average' : 'total');

export function rankFamilies(rows, mode = 'total') {
  const rankingMode = normalizeFamilyRankingMode(mode);
  return assignRankingPositions((Array.isArray(rows) ? rows : []).map((row) => {
    const totalPoints = Number(row.points || 0);
    const averagePoints = Math.round(Number(row.averagePoints || 0) * 100) / 100;
    return {
      ...row,
      points: rankingMode === 'average' ? averagePoints : totalPoints,
      totalPoints,
      averagePoints,
      studentsCount: Number(row.studentsCount || 0),
      rankingMode,
    };
  }).sort((first, second) => (
    second.points - first.points
    || second.studentsCount - first.studentsCount
    || String(first.name).localeCompare(String(second.name), 'ar')
  )));
}
