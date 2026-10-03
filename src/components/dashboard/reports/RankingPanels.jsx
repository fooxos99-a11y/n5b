import React from 'react';
import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';
import RankingPanel from './RankingPanel';
export { default as TeachersPanel } from './TeachersPanel';

const decimalFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', { useGrouping: false, maximumFractionDigits: 1 });
const gradeFormatter = new Intl.NumberFormat('ar-SA-u-nu-latn', { useGrouping: false, maximumFractionDigits: 2 });

/** Best students by their grades in the period, and best circles by the average grade of their students. */
export function RankingPanels({ bestStudents = [], bestCommittees = [], bestComplexes = [] }) {
  const value = row => <span className="ranking-list-value">{row.percentage != null
    ? `${decimalFormatter.format(row.percentage)}%` : row.max === 0 ? '—' : `${decimalFormatter.format(row.average ?? row.grade)} درجة`}</span>;
  return <div className="grid gap-4">
    <RankingPanel title="أفضل الطلاب" rows={bestStudents.map(row => ({
      ...row, note: [row.committeeName || 'بدون حلقة', row.complexName].filter(Boolean).join(' · '),
      value: <span className="ranking-list-value">{gradeFormatter.format(Number(row.grade || 0))} درجة</span>,
    }))} />
    <RankingPanel title="أفضل الحلقات" rows={bestCommittees.map(row => ({
      ...row, note: [row.complexName, `${formatNumber(row.studentsCount)} طالب`].filter(Boolean).join(' · '), value: value(row),
    }))} />
    <RankingPanel title="أفضل المجمعات" rows={bestComplexes.map(row => ({
      ...row, note: `${formatNumber(row.committeesCount)} حلقة · ${formatNumber(row.studentsCount)} طالب`, value: value(row),
    }))} />
  </div>;
}

