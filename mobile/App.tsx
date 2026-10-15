import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from './src/components/AppText';
import { StartupScreen } from './src/components/StartupScreen';
import { NativeProbeScreen } from './src/screens/NativeProbeScreen';
import { NativeAppGate } from './src/NativeAppGate';
import { ThemeProvider } from './src/components/ThemeProvider';
import { brand, usePalette, useTheme } from './src/theme';
import cairo from '../public/fonts/cairo/cairo-400.ttf';
import cairoMedium from '../public/fonts/cairo/cairo-500.ttf';
import cairoBold from '../public/fonts/cairo/cairo-700.ttf';
import cairoBlack from '../public/fonts/cairo/cairo-900.ttf';
import cairoSemi from '../public/fonts/cairo/cairo-600.ttf';
import cairoExtraBold from '../public/fonts/cairo/cairo-800.ttf';
import qcf1 from './assets/fonts/qcf-v1-p1.ttf';
import qcf2 from './assets/fonts/qcf-v1-p2.ttf';
import qcf604 from './assets/fonts/qcf-v1-p604.ttf';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  return <ThemeProvider><Application /></ThemeProvider>;
}
function Application() {
  const palette = usePalette();
  const { theme } = useTheme();
  const [opening, setOpening] = useState(true);
  const [fontsLoaded, fontError] = useFonts({
    Cairo: cairo, CairoMedium: cairoMedium, CairoSemi: cairoSemi, CairoBold: cairoBold, CairoExtraBold: cairoExtraBold, CairoBlack: cairoBlack,
    QcfV1P1: qcf1, QcfV1P2: qcf2, QcfV1P604: qcf604,
  });
  const finishOpening = useCallback(() => setOpening(false), []);
  useEffect(() => { if (fontsLoaded || fontError) void SplashScreen.hideAsync(); }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return <View style={styles.loading}><ActivityIndicator color={brand.accent} /></View>;
  if (fontError) return <View style={styles.loading}><AppText style={{ color: '#fff' }}>تعذّر تحميل الخطوط. أعد فتح التطبيق.</AppText></View>;
  return <SafeAreaProvider>
    <StatusBar style={opening || theme === 'dark' ? 'light' : 'dark'} />
    {opening && <StartupScreen onComplete={finishOpening} />}
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.background, display: opening ? 'none' : 'flex' }}>
      {process.env.EXPO_PUBLIC_NATIVE_PROBES === '1' ? <NativeProbeScreen /> : <NativeAppGate />}
    </SafeAreaView>
  </SafeAreaProvider>;
}
const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: brand.background, alignItems: 'center', justifyContent: 'center' } });
