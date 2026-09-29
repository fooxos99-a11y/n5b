import React from 'react';
import ProgressValue from '@/components/ui/progress-value';

export default function StudentHomeProgress({ value = 0, label, className = '' }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  return <div className={`student-home-progress ${className}`}><ProgressValue value={Math.round(percent)} label={label} /><span style={{ width: `${percent}%` }} /></div>;
}
