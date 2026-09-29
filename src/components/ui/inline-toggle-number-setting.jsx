import React from 'react';
import { Input } from '@/components/ui/input';
import { ToggleSwitch } from '@/components/ui/setting-toggle';

const InlineToggleNumberSetting = ({
  label,
  checked,
  onCheckedChange,
  value,
  onValueChange,
  inputLabel,
  valueLabel = '',
  min = 0,
  max = 100,
  suffix = '',
  showValue = checked,
  disabled = false,
}) => (
  <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/15 bg-card px-4 py-2.5 [font-family:var(--font-ui)]">
    <span className="text-sm font-black text-foreground">{label}</span>
    <div className="flex items-center gap-2">
      {showValue && (
        <div className="flex items-center gap-2">
          {valueLabel && <span className="text-xs font-normal text-muted-foreground sm:text-sm">{valueLabel}</span>}
          <div className="relative w-24">
            <Input
              aria-label={inputLabel || label}
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              disabled={disabled}
              className={`h-11 text-center font-normal tabular-nums ${suffix ? 'ps-8' : ''}`}
              value={value}
              onChange={(event) => onValueChange(Math.min(max, Math.max(min, Number(event.target.value || min))))}
            />
            {suffix && (
              <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-sm font-normal text-muted-foreground">
                {suffix}
              </span>
            )}
          </div>
        </div>
      )}
      <ToggleSwitch ariaLabel={label} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  </div>
);

export default InlineToggleNumberSetting;
