import React from 'react';
import RankingPointsValue from '@/components/points/RankingPointsValue';
import RankingList from '@/components/rankings/RankingList';

export default function StudentRankingList({ rows, family, showPoints, studentId, limit = 5 }) {
  return rows.length ? <RankingList highlightId={family ? undefined : studentId} rows={rows.slice(0, limit).map(row => ({
    ...row, note: !family ? row.committeeName : '',
    value: showPoints ? <RankingPointsValue wholeNumber={family} value={row.points} className="student-rank-points" iconClassName="h-4 w-4" /> : null,
  }))} /> : <p className="student-home-empty">لا توجد بيانات ترتيب حاليًا.</p>;
}
