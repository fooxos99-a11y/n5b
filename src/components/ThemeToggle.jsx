import React, { useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { applyTheme, getCurrentTheme, saveThemePreference, THEME_CHANGE_EVENT } from '@/lib/theme';

const ThemeToggle = ({ className }) => {
  const [theme, setTheme] = useState(getCurrentTheme);
  const isLight = theme === 'light';

  useLayoutEffect(() => {
    const syncTheme = () => setTheme(getCurrentTheme());
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    syncTheme();
    return () => window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = applyTheme(saveThemePreference(isLight ? 'dark' : 'light'));
    setTheme(nextTheme);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={cn(
        'border-0 bg-transparent text-primary shadow-none hover:bg-primary/10 hover:text-primary-light',
        className
      )}
      title={isLight ? 'تفعيل الوضع الليلي' : 'تفعيل الوضع الصباحي'}
      aria-label={isLight ? 'تفعيل الوضع الليلي' : 'تفعيل الوضع الصباحي'}
    >
      {isLight ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </Button>
  );
};

export default ThemeToggle;
