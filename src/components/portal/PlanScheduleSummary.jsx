import React from 'react';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';

const number = value => new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(value);
export default function PlanScheduleSummary({ plan }) {
  if (!plan?.projectedEndDate) return null;
  const delayedFaces = Number(plan.delayedFaces);
  const showDelay = plan.paceStatus === 'behind' && Number.isFinite(delayedFaces) && delayedFaces > 0;
  return <p className="scrollbar-hide max-w-full overflow-x-auto overflow-y-hidden whitespace-nowrap text-xs leading-6 sm:text-sm sm:leading-7" dir="rtl">
    تاريخ انتهاء الخطة المتوقع: <bdi dir="rtl">{formatHijriDate(plan.projectedEndDate)}</bdi>
    {showDelay && <span className="text-destructive">{` (${number(delayedFaces)} أوجه متعثرة)`}</span>}
  </p>;
}
