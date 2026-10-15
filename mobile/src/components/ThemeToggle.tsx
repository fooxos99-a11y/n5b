import { View } from 'react-native';
import { useTheme } from '../theme';
import { DashboardButton } from './dashboard/DashboardButton';

export function ThemeToggle({ inverse = false }: { inverse?: boolean }) {
  const { theme, setTheme, persistenceError } = useTheme();
  return <View>
    <DashboardButton iconOnly inverse={inverse} iconColor={inverse ? '#ffffff' : undefined} icon={theme === 'light' ? 'moon' : 'sun'}
      label={theme === 'light' ? 'تفعيل الوضع الليلي' : 'تفعيل الوضع الصباحي'}
      hint={persistenceError ?? undefined}
      onPress={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
  </View>;
}
