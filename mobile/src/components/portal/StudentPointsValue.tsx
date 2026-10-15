import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { usePalette } from '../../theme';
import { AppText } from '../AppText';

export function StudentPointsValue({ value }: { value: number | null }) {
  const palette = usePalette();
  return <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}>
    <AppText style={{ fontFamily: 'CairoBlack', color: palette.primary, writingDirection: 'ltr', fontSize: 16 }}>
      {value === null ? '—' : new Intl.NumberFormat('ar-SA-u-nu-latn', { maximumFractionDigits: 2 }).format(value)}
    </AppText>
    {value !== null && <Svg width={16} height={16} viewBox="0 0 24 24" accessible={false}>
      <Path d="M12 2.75 14.2 5l3.12-.45.5 3.1 2.8 1.45-1.42 2.8 1.42 2.8-2.8 1.45-.5 3.1-3.12-.45L12 21.05 9.8 18.8l-3.12.45-.5-3.1-2.8-1.45 1.42-2.8-1.42-2.8 2.8-1.45.5-3.1L9.8 5 12 2.75Z" fill={palette.primary} opacity={0.24} />
      <Path d="m12 6.8 1.38 2.8 3.1.45-2.24 2.18.53 3.08L12 13.86 9.23 15.3l.53-3.08-2.24-2.18 3.1-.45L12 6.8Z" fill={palette.primary} />
    </Svg>}
  </View>;
}
