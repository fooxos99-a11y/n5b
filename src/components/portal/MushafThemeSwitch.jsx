import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MushafThemeSwitch = ({ theme, onChange, className = '' }) => (
  <Button
    type="button"
    variant="outline"
    size="icon"
    onClick={() => onChange?.(theme === 'dark' ? 'light' : 'dark')}
    className={`h-11 w-11 rounded-2xl border-primary/25 bg-card/90 text-primary shadow-lg shadow-primary/10 backdrop-blur-xl hover:bg-primary/10 hover:text-primary ${className}`}
    aria-label={theme === 'dark' ? 'تفعيل المصحف الأبيض' : 'تفعيل المصحف الداكن'}
    title={theme === 'dark' ? 'تفعيل المصحف الأبيض' : 'تفعيل المصحف الداكن'}
    data-recitation-control
  >
    {theme === 'dark' ? <Sun aria-hidden className="h-5 w-5" style={{ color: 'var(--reader-ink)', stroke: 'currentColor' }} /> : <Moon aria-hidden className="h-5 w-5" style={{ color: 'var(--reader-ink)', stroke: 'currentColor' }} />}
  </Button>
);

export default MushafThemeSwitch;
