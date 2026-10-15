import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, Path, Pattern, Rect } from 'react-native-svg';
import { brand } from '../theme';
import { AppText } from './AppText';
import { startStartupPresentation } from './startupPresentation';
import whiteLogo from '../../../public/branding/nukhab/nukhab-white.png';

export function StartupScreen({ onComplete }: { onComplete: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.12)).current;
  useEffect(() => startStartupPresentation({
    isReduceMotionEnabled: () => AccessibilityInfo.isReduceMotionEnabled(),
    onComplete,
    animate: onEnd => {
      const animation = Animated.sequence([
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 960, useNativeDriver: true }),
        ]),
        Animated.delay(560),
        Animated.timing(opacity, { toValue: 0, duration: 480, useNativeDriver: true }),
      ]);
      animation.start(onEnd);
      return animation;
    },
  }), [onComplete, opacity, scale]);

  return <View style={styles.screen}>
    <Animated.View style={{ opacity, transform: [{ scale }], alignItems: 'center' }}>
      <Image source={whiteLogo}
        style={styles.logo} resizeMode="contain" accessibilityLabel="شعار نخب" />
      <AppText style={styles.name}>برنامج نخب التعليمي</AppText>
    </Animated.View>
    <Svg width="100%" height={192} style={styles.pattern} accessibilityElementsHidden>
      <Defs><Pattern id="nukhab-ornament" width={96} height={96} patternUnits="userSpaceOnUse">
        <G fill="none" stroke={brand.accent} strokeWidth={1.2}>
          <Path d="M48 0 96 48 48 96 0 48Z" />
          {[0, 90, 180, 270].map(angle => <Path key={angle} transform={`rotate(${angle} 48 48)`}
            d="M48 48C22 48 16 28 16 16C28 16 48 22 48 48Z" />)}
        </G>
      </Pattern></Defs>
      <Rect width="100%" height="100%" fill="url(#nukhab-ornament)" />
    </Svg>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: brand.background,
  alignItems: 'center', justifyContent: 'center' }, logo: { width: 200, height: 240, marginBottom: 20 },
  name: { color: '#fff', fontFamily: 'CairoBold', fontSize: 25, lineHeight: 40 },
  pattern: { position: 'absolute', bottom: 0, opacity: 0.28 } });
