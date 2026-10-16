import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

const normalizeList = (value = []) => (Array.isArray(value) ? value : []).map(String);

const MultiSelectSetting = ({ value, options, placeholder, onToggle, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      containerRef.current?.querySelector('button[aria-expanded]')?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [open]);
  const selectedValues = new Set(normalizeList(value));
  const selectedLabels = options
    .filter((option) => selectedValues.has(String(option.value)))
    .map((option) => option.label);

  return (
    <div ref={containerRef} className="relative [font-family:var(--font-ui)]"
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="select-trigger-solid relative flex h-11 w-full items-center rounded-xl border border-primary/30 bg-card py-2 pl-10 pr-3 text-right text-sm ring-offset-background transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={`min-w-0 flex-1 truncate text-right ${selectedLabels.length ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selectedLabels.length ? selectedLabels.join('، ') : placeholder}
        </span>
        <ChevronDown className={`absolute left-3 h-4 w-4 shrink-0 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </Button>
      {open && <div className="select-content-solid absolute left-0 right-0 top-14 z-50 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-primary/20 bg-card p-1 text-foreground shadow-xl touch-pan-y [-webkit-overflow-scrolling:touch]">
          {options.map((option) => {
            const active = selectedValues.has(String(option.value));
            return (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => onToggle(option.value)}
                className={`flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-right text-sm hover:translate-y-0 ${active ? 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary' : 'bg-transparent text-foreground hover:bg-transparent hover:text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:bg-muted'}`}
              >
                <span className="min-w-0 flex-1 truncate text-right">{option.label}</span>
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-current/30" aria-hidden="true">
                  {active && <Check className="h-4 w-4" />}
                </span>
              </Button>
            );
          })}
      </div>}
    </div>
  );
};

export default MultiSelectSetting;
