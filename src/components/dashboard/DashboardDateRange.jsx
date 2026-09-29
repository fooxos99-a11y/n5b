import React from 'react';
import { DashboardDatePicker } from '@/components/dashboard/DashboardControls';

export default function DashboardDateRange({ from, to, onFromChange, onToChange, sessionDates = true }) {
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 [font-family:var(--font-ui)]" dir="rtl" data-date-range>
    <DashboardDatePicker sessionDates={sessionDates} value={from} max={to} onChange={onFromChange} ariaLabel="التاريخ من" className="h-11 min-w-0 px-2 text-xs" />
    <span className="text-xs text-muted-foreground">إلى</span>
    <DashboardDatePicker sessionDates={sessionDates} value={to} min={from} onChange={onToChange} ariaLabel="التاريخ إلى" className="h-11 min-w-0 px-2 text-xs" />
  </div>;
}
