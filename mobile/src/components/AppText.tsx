import { Text, type TextProps } from 'react-native';
import { usePalette } from '../theme';

export function AppText({ style, ...props }: TextProps) {
  const palette = usePalette();
  return <Text {...props} style={[{ fontFamily: 'Cairo', fontSize: 15, lineHeight: 26,
    color: palette.text, textAlign: 'right', writingDirection: 'rtl' }, style]} />;
}
