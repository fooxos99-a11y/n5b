import React, { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DashboardDatePicker } from '@/components/dashboard/DashboardControls';
import { FormField, FormGrid } from '@/components/dashboard/layout/ManagementPanel';
import SettingsGroup from '@/components/dashboard/SettingsGroup';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';
import { normalizeSeasonalHolidays } from '../../../shared/seasonal-holidays.js';

export default function SeasonalHolidaysSetting({ holidays = [], onChange }) {
  const id = useId();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const add = () => {
    try {
      onChange(normalizeSeasonalHolidays([...holidays, { startDate, endDate }]));
      setStartDate(''); setEndDate(''); setError('');
    } catch (failure) { setError(failure.message); }
  };
  return <div dir="rtl">
    <SettingsGroup>
      <FormGrid>
        <FormField label="بداية الإجازة" htmlFor={`${id}-start`}><DashboardDatePicker id={`${id}-start`} value={startDate} ariaLabel="بداية الإجازة" onChange={setStartDate} /></FormField>
        <FormField label="نهاية الإجازة" htmlFor={`${id}-end`}><DashboardDatePicker id={`${id}-end`} value={endDate} min={startDate || undefined} ariaLabel="نهاية الإجازة" onChange={setEndDate} /></FormField>
      </FormGrid>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" className="min-h-11" onClick={add} disabled={!startDate || !endDate || holidays.length >= 100}>إضافة إجازة</Button>
    </SettingsGroup>
    {holidays.length > 0 && <ul aria-label="الإجازات الموسمية" className="divide-y divide-border border-t border-border">
      {holidays.map((holiday, index) => <li key={`${holiday.startDate}:${holiday.endDate}:${index}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <span className="flex min-w-0 flex-wrap gap-x-2 text-sm leading-6"><bdi dir="rtl">{formatHijriDate(holiday.startDate)}</bdi><span>—</span><bdi dir="rtl">{formatHijriDate(holiday.endDate)}</bdi></span>
        <Button type="button" variant="outline" className="min-h-11 shrink-0" aria-label={`إزالة الإجازة ${index + 1}`} onClick={() => onChange(holidays.filter((_item, at) => at !== index))}>إزالة</Button>
      </li>)}
    </ul>}
  </div>;
}
