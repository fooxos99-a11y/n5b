import React from 'react';
import { cn } from '@/lib/utils';

export default function CheckboxOption({ checked, onCheckedChange, label, className, children }) {
  return (
    <label className={cn('relative min-h-11 cursor-pointer touch-manipulation rounded-xl focus-within:ring-2 focus-within:ring-primary/40 [font-family:var(--font-ui)]', className)}>
      <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      {children}
    </label>
  );
}
