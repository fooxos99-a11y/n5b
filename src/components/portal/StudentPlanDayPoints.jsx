import React from 'react';
import RankingPointsValue from '@/components/points/RankingPointsValue';
import { formatPointsNumber } from '@/lib/pointsFormat';

export default function StudentPlanDayPoints({ points }) {
  if (!points) return null;
  if (points.pending) return <span className="text-xs text-muted-foreground [font-family:var(--font-ui)]">بانتظار التقييم</span>;
  return <div className="min-w-0 text-sm [font-family:var(--font-ui)]"><details>
    <summary className="flex min-h-11 cursor-pointer items-center justify-end gap-1 rounded-md px-2 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-label={`نقاط اليوم: ${formatPointsNumber(points.earned)}`}>
      <RankingPointsValue value={points.earned} iconClassName="h-4 w-4" />
    </summary>
    <ul className="space-y-1 pb-2">
      {points.details.map((item, index) => <li key={`${item.label}:${index}`} className="flex items-center justify-between gap-3"><span>{item.label}</span><RankingPointsValue value={item.earned} iconClassName="h-4 w-4" /></li>)}
    </ul>
  </details>{points.additionalDetails?.length > 0 && <details>
    <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><span>البرامج والمكافآت والتعديلات</span><RankingPointsValue value={points.additionalEarned} iconClassName="h-4 w-4" /></summary>
    <ul className="space-y-1 pb-2">{points.additionalDetails.map((item, index) => <li key={`${item.label}:${index}`} className="flex items-center justify-between gap-3"><span>{item.label}</span><RankingPointsValue value={item.earned} iconClassName="h-4 w-4" /></li>)}</ul>
  </details>}</div>;
}
