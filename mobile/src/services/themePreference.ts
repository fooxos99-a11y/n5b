import * as SecureStore from 'expo-secure-store';
import type { ThemeName } from '../theme';

const key = 'nukhab_theme_account';
export async function readThemePreference(): Promise<ThemeName> {
  return await SecureStore.getItemAsync(key) === 'dark' ? 'dark' : 'light';
}
export async function writeThemePreference(theme: ThemeName): Promise<void> {
  await SecureStore.setItemAsync(key, theme);
}
