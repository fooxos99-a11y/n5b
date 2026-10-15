import type { ReactNode } from 'react';
import { PaletteContext, useTheme, type Palette } from '../../theme';

// StudentHome has its own palette in student-home.css and student-home-theme.css.
const studentPalettes: Record<'light' | 'dark', Palette> = {
  light: { background: '#f5f8fa', card: '#ffffff', text: '#174b47', muted: '#71858c', primary: '#0c737e',
    onPrimary: '#ffffff', border: '#dce7eb', selected: '#eaf5f5', mutedSurface: '#edf3f5', error: '#a7443f', mushaf: '#fffaf0' },
  dark: { background: '#24303d', card: '#2f3f4c', text: '#e9f1f4', muted: '#b3c3ce', primary: '#86d5cd',
    onPrimary: '#1b2b37', border: '#4a5e6d', selected: '#354e5a', mutedSurface: '#283a49', error: '#ff8b8b', mushaf: '#173e37' },
};

export function StudentPortalTheme({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <PaletteContext.Provider value={studentPalettes[theme]}>{children}</PaletteContext.Provider>;
}

const windowPalettes: Record<'light' | 'dark', Palette> = {
  light: { ...studentPalettes.light, background: '#f6f8f9', text: '#18404e', muted: '#5a747c', border: '#d3e0e4',
    selected: '#e4eef1', mutedSurface: '#edf1f3' },
  dark: { ...studentPalettes.dark, text: '#e9f2f1', muted: '#b3c2cc', selected: '#3c4e5d', error: '#ee8b8b' },
};
export function StudentWindowTheme({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return <PaletteContext.Provider value={windowPalettes[theme]}>{children}</PaletteContext.Provider>;
}
