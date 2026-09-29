import React, { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MAX_COUNT = 1000;
const normalizeCount = (value) => Math.min(MAX_COUNT, Math.max(0, Math.trunc(Number(value) || 0)));

/** Touch-friendly non-negative counter (mistakes, warnings). */
export default function GradeCounter({ label, value, onChange, disabled = false }) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-2 [font-family:var(--font-ui)]">
      <Label htmlFor={id} className="block text-xs">{label}</Label>
      <div className="grid grid-cols-[2.75rem_minmax(2.75rem,4rem)_2.75rem] justify-start gap-1" dir="ltr">
        <Button type="button" variant="outline" size="icon" className="touch-manipulation" aria-label={`إنقاص ${label}`} disabled={disabled || value <= 0} onClick={() => onChange(normalizeCount(value - 1))}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Input
          id={id}
          type="number"
          min="0"
          max={MAX_COUNT}
          inputMode="numeric"
          disabled={disabled}
          className="h-11 min-w-0 px-1 text-center font-black tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          value={value}
          onChange={(event) => onChange(normalizeCount(event.target.value))}
        />
        <Button type="button" variant="outline" size="icon" className="touch-manipulation" aria-label={`زيادة ${label}`} disabled={disabled} onClick={() => onChange(normalizeCount(value + 1))}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
