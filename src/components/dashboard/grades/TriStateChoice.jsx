import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const OPTIONS = Object.freeze([
  { key: 'yes', value: true, selectedClassName: 'bg-emerald-600 !text-white hover:bg-emerald-600 hover:!text-white' },
  { key: 'no', value: false, selectedClassName: 'bg-destructive !text-white hover:bg-destructive hover:!text-white' },
  { key: 'none', value: null, selectedClassName: 'bg-card text-foreground shadow-sm hover:bg-card hover:text-foreground' },
]);

/**
 * Radio group: recorded as yes, recorded as no, or not recorded (null).
 * `allowNone={false}` keeps only yes/no for pages where every choice is a record.
 */
export default function TriStateChoice({ value, onChange, labels, ariaLabel, disabled = false, stacked = false, allowNone = true, className }) {
  const current = value ?? null;
  // Present/absent only: «غائب» sits on the right and «حاضر» on the left.
  const options = allowNone ? OPTIONS : [OPTIONS[1], OPTIONS[0]];
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('grid min-w-0 gap-1 rounded-xl bg-muted p-1 [font-family:var(--font-ui)]', allowNone ? 'grid-cols-3' : 'grid-cols-2', stacked && 'lg:grid-cols-1', className)}
    >
      {options.map((option) => {
        const selected = current === option.value;
        return (
          <Button
            key={option.key}
            type="button"
            variant="ghost"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => { if (!selected) onChange(option.value); }}
            className={cn(
              'h-11 min-w-0 whitespace-normal rounded-lg px-1 text-xs leading-4 hover:translate-y-0',
              selected ? option.selectedClassName : 'text-muted-foreground',
            )}
          >
            {labels[option.key]}
          </Button>
        );
      })}
    </div>
  );
}
