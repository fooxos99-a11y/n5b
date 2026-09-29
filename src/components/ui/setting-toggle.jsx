import React from 'react';

export const ToggleSwitch = ({ checked, onCheckedChange, disabled = false, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className="group relative h-11 w-14 shrink-0 rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-45"
  >
    <span className={`absolute left-1 top-1/2 h-7 w-12 -translate-y-1/2 rounded-full border transition-colors ${
      checked ? 'border-primary bg-primary' : 'border-border bg-muted'
    }`}>
      <span className={`absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform ${
        checked ? 'translate-x-0' : 'translate-x-5'
      }`} />
    </span>
  </button>
);

const SettingToggle = ({ checked, onCheckedChange, label, description = '', disabled = false }) => (
  <div className="flex min-h-14 items-center justify-between gap-4 rounded-xl bg-muted/50 px-4 py-2.5 [font-family:var(--font-ui)]">
    <span className="min-w-0">
      <span className="block text-sm font-black text-foreground">{label}</span>
      {description && <span className="mt-1 block text-xs font-bold leading-5 text-muted-foreground">{description}</span>}
    </span>
    <ToggleSwitch
      ariaLabel={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
    />
  </div>
);

export default SettingToggle;
