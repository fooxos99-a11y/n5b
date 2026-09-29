import React, { useId, useRef } from 'react';
import { Button } from '@/components/ui/button';

export default function SectionTabs({ items, value, onChange, label, children, className = '' }) {
  const id = useId();
  const refs = useRef([]);
  const index = items.findIndex((item) => item.value === value);
  const keyDown = (event) => {
    let next;
    if (event.key === 'ArrowLeft') next = (index + 1) % items.length;
    if (event.key === 'ArrowRight') next = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = items.length - 1;
    if (next == null) return;
    event.preventDefault(); onChange(items[next].value); refs.current[next]?.focus();
  };
  return <div className={`section-tabs ${className}`} dir="rtl">
    <div role="tablist" aria-label={label} className="section-tabs-list">
      {items.map((item, i) => <Button key={item.value} ref={(node) => { refs.current[i] = node; }} variant="ghost" role="tab" id={`${id}-${item.value}`} aria-selected={item.value === value} aria-controls={`${id}-panel`} tabIndex={item.value === value ? 0 : -1} onKeyDown={keyDown} onClick={() => onChange(item.value)}>{item.label}</Button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`} tabIndex={0}>{children}</div>
  </div>;
}
