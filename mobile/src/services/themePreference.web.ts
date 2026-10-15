import type { ThemeName } from '../theme';

const key = 'nukhab_theme_account';
export async function readThemePreference(): Promise<ThemeName> {
  return globalThis.localStorage.getItem(key) === 'dark' ? 'dark' : 'light';
}
export async function writeThemePreference(theme: ThemeName): Promise<void> {
  globalThis.localStorage.setItem(key, theme);
}
