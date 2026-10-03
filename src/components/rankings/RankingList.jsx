import React from 'react';
import { Award, Crown } from 'lucide-react';
import './ranking-list.css';

/** Shared ranking rows for the student portal and scoped statistics. */
export default function RankingList({ rows = [], highlightId, cards = false, className = '' }) {
  return <ol className={`student-home-rank-list${cards ? ' ranking-list-cards' : ''}${className ? ` ${className}` : ''}`}>{rows.map((row, index) => {
    const rank = row.rank ?? index + 1;
    return <li key={row.id} data-rank={rank} data-self={highlightId != null && String(row.id) === String(highlightId)}>
      <span className="student-home-rank-medal" aria-label={`المركز ${rank}`}>
        {rank === 1 ? <Crown size={21} /> : rank <= 3 ? <Award size={21} /> : Number(rank).toLocaleString('ar-SA-u-nu-latn')}
        {rank <= 3 && <small>{Number(rank).toLocaleString('ar-SA-u-nu-latn')}</small>}
      </span>
      <span className="student-home-rank-name"><strong>{row.name}</strong>{row.note && <small>{row.note}</small>}</span>
      {row.value != null && row.value}
    </li>;
  })}</ol>;
}
