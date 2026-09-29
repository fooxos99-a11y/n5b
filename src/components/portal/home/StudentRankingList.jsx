import React from 'react';
import { Award, Crown } from 'lucide-react';
import RankingPointsValue from '@/components/points/RankingPointsValue';

export default function StudentRankingList({ rows, family, showPoints, studentId, limit = 5 }) {
  return rows.length ? <ol className="student-home-rank-list">{rows.slice(0, limit).map((row) => { const _resolveConditional = () => {
                                                                                                     if (row.rank === 1) {
                                                                                                       return <Crown size={21} />;
                                                                                                     }
                                                                                                     if (row.rank <= 3) {
                                                                                                       return <Award size={21} />;
                                                                                                     }
                                                                                                     return Number(row.rank).toLocaleString('ar-SA-u-nu-latn');
                                                                                                   };
                                                                                                   return (<li key={row.id} data-rank={row.rank} data-self={!family && String(row.id) === String(studentId)}>
    <span className="student-home-rank-medal" aria-label={`المركز ${row.rank}`}>{_resolveConditional()}<small>{row.rank <= 3 ? Number(row.rank).toLocaleString('ar-SA-u-nu-latn') : ''}</small></span>
    <span className="student-home-rank-name"><strong>{row.name}</strong>{!family && row.committeeName && <small>{row.committeeName}</small>}</span>
    {showPoints && <RankingPointsValue wholeNumber={family} value={row.points} className="student-rank-points" iconClassName="h-4 w-4" />}
  </li>); })}</ol> : <p className="student-home-empty">لا توجد بيانات ترتيب حاليًا.</p>;
}
