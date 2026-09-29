import React, { useId, useRef } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * Unified management page: one card holding the tabs, the toolbar and the content.
 * Content inside is separated by dividers, never by nested cards.
 */
export function ManagementPanel({ tabs = null, toolbar = null, children, className }) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[var(--app-shadow)] [font-family:var(--font-ui)]', className)} dir="rtl">
      {tabs}
      {toolbar}
      {children}
    </section>
  );
}

/** Underlined tabs across the top of the panel; scrolls horizontally on small screens. */
export function ManagementTabs({ items, value, onChange, label, children }) {
  const id = useId();
  const refs = useRef([]);
  const index = items.findIndex((item) => item.value === value);
  const onKeyDown = (event) => {
    const moves = { ArrowLeft: index + 1, ArrowRight: index - 1, Home: 0, End: items.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key] + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div role="tablist" aria-label={label} className="flex overflow-x-auto border-b border-border px-2 sm:px-4 [scrollbar-width:none]">
        {items.map((item, itemIndex) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              ref={(node) => { refs.current[itemIndex] = node; }}
              type="button"
              role="tab"
              id={`${id}-${item.value}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onKeyDown={onKeyDown}
              onClick={() => onChange(item.value)}
              className={cn(
                'relative min-h-12 shrink-0 whitespace-nowrap px-4 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:transition-colors',
                selected ? 'text-primary after:bg-primary' : 'text-muted-foreground after:bg-transparent hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`}>{children}</div>
    </>
  );
}

/** Search, filters and the main action in one aligned row. */
export function ManagementToolbar({ children, className }) {
  return <div className={cn('flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:gap-3 sm:px-6 [&>*]:min-w-0', className)}>{children}</div>;
}

export function ManagementList({ label, children }) {
  return <ul aria-label={label} className="divide-y divide-border">{children}</ul>;
}

/** One record: title (opens it), secondary line, optional meta and actions. */
export function ManagementRow({ title, subtitle, meta, actions, onOpen, openLabel, disabled = false, icon = null }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-6">
      <div className="min-w-0 flex-1">
        {onOpen ? (
          <button type="button" onClick={onOpen} disabled={disabled} aria-label={openLabel} className="inline-flex max-w-full items-center gap-2 rounded-md text-right text-base font-bold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:text-foreground">
            {icon}
            <span className="truncate">{title}</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 text-base font-bold text-foreground">{icon}<span className="truncate">{title}</span></div>
        )}
        {subtitle && <div className="mt-0.5 truncate text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {meta && <div className="hidden shrink-0 text-sm sm:block">{meta}</div>}
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </li>
  );
}

export function ManagementEmpty({ children }) {
  return <p className="px-4 py-12 text-center text-sm text-muted-foreground sm:px-6">{children}</p>;
}

/** Label above its control with a consistent gap; `wide` spans both columns of a FormGrid. */
export function FormField({ label, htmlFor, wide = false, hint, children }) {
  return (
    <div className={cn('min-w-0 space-y-1.5', wide && 'sm:col-span-2')}>
      <Label htmlFor={htmlFor} className="text-sm font-bold">{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function FormGrid({ children, className }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
