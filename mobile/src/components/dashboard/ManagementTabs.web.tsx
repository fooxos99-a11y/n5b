import { useId, useLayoutEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { usePalette } from '../../theme';
import type { ManagementTabsProps } from './ManagementTabs';

export function ManagementTabs<Key extends string>({ items, value, onChoose, label = 'فئات المستخدمين', disabled = false,
  focusKey, onKeyboardChoose, onFocusRestored }: ManagementTabsProps<Key>) {
  const palette = usePalette(), id = useId(), refs = useRef<(HTMLButtonElement | null)[]>([]);
  const { width } = useWindowDimensions();
  useLayoutEffect(() => {
    if (focusKey !== value) return;
    refs.current[items.findIndex(item => item.key === value)]?.focus(); onFocusRestored?.();
  }, [focusKey, items, onFocusRestored, value]);
  return <div role="tablist" aria-label={label} dir="rtl" style={{ display: 'flex', overflowX: 'auto',
    borderBottom: `1px solid ${palette.border}`, paddingInline: width < 640 ? 8 : 16 }}>
    {items.map((item, index) => <button key={item.key} type="button" id={`${id}-${item.key}`} ref={node => { refs.current[index] = node; }}
      role="tab" aria-selected={item.key === value} tabIndex={item.key === value ? 0 : -1} disabled={disabled}
      onClick={() => onChoose(item.key)} onKeyDown={event => {
        const step = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
        if (disabled || (!step && event.key !== 'Home' && event.key !== 'End')) return;
        event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + step + items.length) % items.length;
        const selection = items[next]; if (selection) { onKeyboardChoose?.(selection.key); onChoose(selection.key); refs.current[next]?.focus(); }
      }} style={{ opacity: disabled ? 0.5 : 1, minHeight: 48, flexShrink: 0, paddingInline: 16, background: 'transparent', cursor: disabled ? 'default' : 'pointer', fontFamily: 'CairoBold',
        fontSize: 14, color: item.key === value ? palette.primary : palette.muted,
        border: 0, position: 'relative' }}>{item.label}
        {item.key === value && <span aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: 12, right: 12, height: 2, borderRadius: 1, background: palette.primary }} />}
      </button>)}
  </div>;
}
