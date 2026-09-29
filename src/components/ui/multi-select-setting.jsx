import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const normalizeList = (value = []) => (Array.isArray(value) ? value : []).map(String);

const MultiSelectSetting = ({ value, options, placeholder, onToggle, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const selectedValues = new Set(normalizeList(value));
  const selectedLabels = options
    .filter((option) => selectedValues.has(String(option.value)))
    .map((option) => option.label);

  return (
    <div
      className="relative [font-family:var(--font-ui)]"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-11 w-full items-center rounded-xl border border-primary/30 bg-card py-2 pl-10 pr-3 text-right text-sm ring-offset-background transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`min-w-0 flex-1 truncate text-right ${selectedLabels.length ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selectedLabels.length ? selectedLabels.join('، ') : placeholder}
        </span>
        <ChevronDown className={`absolute left-3 h-4 w-4 shrink-0 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-14 z-50 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-primary/20 bg-card p-1 text-foreground shadow-xl touch-pan-y [-webkit-overflow-scrolling:touch]">
          {options.map((option) => {
            const active = selectedValues.has(String(option.value));
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                onClick={() => onToggle(option.value)}
                className={`flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-right text-sm outline-none transition hover:bg-primary/10 hover:text-primary focus-visible:bg-primary/10 focus-visible:text-primary ${active ? 'bg-primary/10 text-primary' : 'text-foreground'}`}
              >
                <span className="min-w-0 flex-1 truncate text-right">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MultiSelectSetting;
