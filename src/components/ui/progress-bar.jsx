import React from 'react';
import { cn } from '@/lib/utils';
import ProgressValue from '@/components/ui/progress-value';

const ProgressBar = ({ value = 0, className = '', label = 'نسبة التقدم' }) => {
  const normalizedValue = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <div
      className={cn('h-2 w-full min-w-28 overflow-hidden rounded-full bg-primary/20', className)}
    >
      <ProgressValue value={normalizedValue} label={label} />
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${normalizedValue}%` }}
      />
    </div>
  );
};

export default ProgressBar;
