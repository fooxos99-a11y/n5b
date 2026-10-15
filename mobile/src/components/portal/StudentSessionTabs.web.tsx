import { useId, useRef } from 'react';
import { useTheme } from '../../theme';
import { studentSessionTabs, type StudentSessionTabsProps } from './studentSessionNavigation';

export function StudentSessionTabs({ value, onChange, children }: StudentSessionTabsProps) {
  const { theme } = useTheme(); const dark = theme === 'dark'; const id = useId(); const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return <div dir="rtl">
    <style>{`.student-session-tab:focus-visible{outline:2px solid #159a8f;outline-offset:3px}`}</style>
    <div role="tablist" aria-label="أقسام الجلسات" style={{ display: 'flex', padding: 4, borderRadius: 13, gap: 4,
      marginBottom: 18, background: dark ? '#283a49' : '#edf3f5' }}>
      {studentSessionTabs.map((tab, index) => <button key={tab.value} ref={node => { refs.current[index] = node; }} type="button"
        role="tab" id={`${id}-${tab.value}`} aria-selected={value === tab.value} aria-controls={`${id}-panel`} tabIndex={value === tab.value ? 0 : -1}
        className="student-session-tab" onClick={() => onChange(tab.value)} onKeyDown={event => {
          const step = event.key === 'ArrowLeft' ? 1 : event.key === 'ArrowRight' ? -1 : 0;
          if (!step && event.key !== 'Home' && event.key !== 'End') return;
          event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? studentSessionTabs.length - 1
            : (index + step + studentSessionTabs.length) % studentSessionTabs.length;
          onChange(studentSessionTabs[next]!.value); refs.current[next]?.focus();
        }} style={{ flex: 1, minWidth: 0, minHeight: 44, paddingInline: 12, border: 0, borderRadius: 10, fontSize: 13,
          cursor: 'pointer', fontFamily: value === tab.value ? 'CairoExtraBold' : 'CairoBold',
          color: value === tab.value ? dark ? '#a5e7df' : '#097970' : dark ? '#c1d0d9' : '#687e86',
          background: value === tab.value ? dark ? '#405866' : '#ffffff' : 'transparent',
          boxShadow: value === tab.value ? '0 2px 7px #173f4b12' : undefined }}>{tab.label}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`} tabIndex={0}>{children}</div>
  </div>;
}
