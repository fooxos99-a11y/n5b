import { useContext, useEffect, useRef, useState } from 'react';
import { AppText } from './AppText';
import { DashboardIcon } from './dashboard/DashboardIcon';
import { usePalette } from '../theme';
import type { ChoiceOptionsProps } from './ChoiceOptions';
import { DialogPresentationContext } from './FormDialog';

export function ChoiceOptions({ title, options, value, onChoose }: ChoiceOptionsProps) {
  const palette = usePalette();
  const presented = useContext(DialogPresentationContext);
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const [focused, setFocused] = useState(selected);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => { if (presented) refs.current[selected]?.focus(); }, [presented, selected, options]);
  return <div role="radiogroup" aria-label={title} dir="rtl" style={{ display: 'grid', gap: 4 }}>
    {options.map((option, index) => <button key={option.value} type="button" role="radio" aria-label={option.label}
      aria-checked={option.value === value} tabIndex={index === focused ? 0 : -1}
      ref={element => { refs.current[index] = element; }} onFocus={() => setFocused(index)}
      onClick={() => onChoose(option.value)} onKeyDown={event => {
        const step = ['ArrowDown', 'ArrowLeft'].includes(event.key) ? 1 : ['ArrowUp', 'ArrowRight'].includes(event.key) ? -1 : 0;
        if (!step && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + step + options.length) % options.length;
        refs.current[next]?.focus();
      }} style={{ minHeight: 44, width: '100%', border: '1px solid transparent', borderRadius: 8,
        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'right', cursor: 'pointer',
        background: value === option.value ? palette.selected : 'transparent',
        outlineColor: palette.primary, outlineOffset: -2 }}>
      <AppText style={{ flex: 1, fontSize: 14, lineHeight: 24 }}>{option.label}</AppText>
      {value === option.value && <DashboardIcon name="check" size={16} color={palette.primary} />}
    </button>)}
    {!options.length && <AppText>لا توجد خيارات متاحة.</AppText>}
  </div>;
}
