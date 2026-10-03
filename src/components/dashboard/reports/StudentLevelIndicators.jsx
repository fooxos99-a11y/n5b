import React, { useState } from 'react';
import SegmentedMetricCard from './SegmentedMetricCard';
import PlanPerformanceChart from './PlanPerformanceChart';

export default function StudentLevelIndicators({ groups, records }) {
  const [selected, setSelected] = useState(null);
  const level = groups.flatMap(group => group.levels).find(item => item.key === selected);
  const students = records.find(group => group.key === selected)?.rows || [];
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
      {groups.map(group => <section key={group.key} aria-label={group.name} className="min-w-0">
        <SegmentedMetricCard bare metric={{
          key: group.key, label: group.name, color: group.color, countValue: group.count,
          segments: group.levels.map(item => ({ ...item, label: item.name })),
        }} onSelect={(_metric, active) => { if (active) setSelected(active.key); }} />
      </section>)}
    </div>
    {level && <section aria-label={`طلاب ${level.name}`} className="border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-bold">{level.name}</h3>
      {students.length ? <ul className="divide-y divide-border">
        {students.map((student, index) => <li key={index} className="flex items-center justify-between gap-3 py-3 text-sm">
          <span className="min-w-0 break-words font-bold">{student.label}</span><div className="w-44 min-w-0 shrink-0 sm:w-56"><PlanPerformanceChart compact title={`أداء ${student.label}`} series={student.series} /></div>
        </li>)}
      </ul> : <p className="py-5 text-center text-sm text-muted-foreground">لا يوجد طلاب في هذا المستوى.</p>}
    </section>}
  </div>;
}
