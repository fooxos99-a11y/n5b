import React from 'react';
import { Button } from '@/components/ui/button';

const periods = [
  { value: 1, label: 'اليوم' },
  { value: 7, label: '7 أيام' },
  { value: 30, label: '30 يومًا' },
];

const OwnerPeriodFilter = ({ value, onChange }) => (
  <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-card p-1" aria-label="الفترة الزمنية">
    {periods.map((period) => (
      <Button
        key={period.value}
        type="button"
        variant={value === period.value ? 'default' : 'ghost'}
        className="h-11 min-h-11 px-2 text-xs sm:text-sm"
        onClick={() => onChange(period.value)}
      >
        {period.label}
      </Button>
    ))}
  </div>
);

export default OwnerPeriodFilter;
