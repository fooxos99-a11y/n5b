import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ThemeContext, type ThemeName } from '../theme';
import { readThemePreference, writeThemePreference } from '../services/themePreference';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<ThemeName>('light');
  const [persistenceError, setError] = useState<string | null>(null);
  const selected = useRef(false);
  const writes = useRef(Promise.resolve());
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    void readThemePreference().then(value => { if (active && !selected.current) updateTheme(value); })
      .catch(() => { if (active && !selected.current) setError('تعذّر استعادة مظهر التطبيق.'); });
    return () => { active = false; };
  }, []);
  const setTheme = useCallback((next: ThemeName) => {
    selected.current = true; updateTheme(next); setError(null);
    const operation = ++revision.current;
    writes.current = writes.current.then(() => writeThemePreference(next))
      .then(() => { if (revision.current === operation) setError(null); })
      .catch(() => { if (revision.current === operation) setError('تعذّر حفظ المظهر. سيبقى اختيارك لهذه الجلسة.'); });
  }, []);
  return <ThemeContext.Provider value={{ theme, setTheme, persistenceError }}>{children}</ThemeContext.Provider>;
}
