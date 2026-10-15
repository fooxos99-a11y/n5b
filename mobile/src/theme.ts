import { createContext, useContext } from 'react';
import { nukhabColors } from '../../shared/nukhab-theme.js';

export const brand = { background: '#04433D', accent: '#f0bd55', name: 'نخب', id: 'nukhab' } as const;
const color = (value: string) => {
  const [hue = 0, saturation = 0, lightness = 0] = value.trim().split(/\s+/).map(part => Number.parseFloat(part));
  const light = lightness / 100, amplitude = saturation / 100 * Math.min(light, 1 - light);
  return `#${[0, 8, 4].map(channel => {
    const position = (channel + hue / 30) % 12;
    return Math.round(255 * (light - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1)))).toString(16).padStart(2, '0');
  }).join('')}`;
};
const webPalette = (mode: 'light' | 'dark') => {
  const source = nukhabColors[mode];
  return { background: color(source.background), card: color(source.card), text: color(source.foreground),
    muted: color(source.mutedForeground), primary: color(source.primary), onPrimary: '#ffffff',
    border: color(source.border), selected: color(source.accent), mutedSurface: color(source.muted),
    error: color(mode === 'light' ? '3 47% 51%' : '3 52% 52%'),
    mushaf: mode === 'light' ? '#fffaf0' : '#173e37' };
};
export const palettes = {
  light: webPalette('light'), dark: webPalette('dark'),
} as const;
export type Palette = { [Key in keyof typeof palettes.light]: string };
export const PaletteContext = createContext<Palette | null>(null);
export type ThemeName = 'light' | 'dark';
export const ThemeContext = createContext<{ theme: ThemeName; setTheme: (theme: ThemeName) => void; persistenceError: string | null }>({
  theme: 'light', setTheme: () => undefined, persistenceError: null,
});
export function useTheme() { return useContext(ThemeContext); }
export function usePalette(): Palette {
  const override = useContext(PaletteContext);
  const { theme } = useTheme();
  return override ?? palettes[theme];
}
