import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePalette, useTheme } from '../../theme';
import { AppText } from '../AppText';
import { DashboardButton } from '../dashboard/DashboardButton';
import { useDialogDismiss } from '../dialogDismiss';
import { StudentBottomNavigation } from './StudentPortalSurface';
import { StudentWindowTheme } from './StudentPortalTheme';
import type { StudentSessionTab } from './studentSessionNavigation';

export function StudentSessionSurface(props: { visible: boolean; onClose: () => void; children: ReactNode;
  tab: StudentSessionTab; onStore?: () => void }) {
  return <StudentWindowTheme><SessionSurface {...props} /></StudentWindowTheme>;
}
function SessionSurface({ visible, onClose, children, tab, onStore }: { visible: boolean; onClose: () => void; children: ReactNode;
  tab: StudentSessionTab; onStore?: () => void }) {
  const palette = usePalette(); const { theme } = useTheme(); const { width, height } = useWindowDimensions(); const compact = width < 900;
  const [retained, retain] = useState(visible); const [reduced, reduce] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const body = useRef<ScrollView>(null); const positions = useRef<Record<StudentSessionTab, number>>({ evaluation: 0, saved: 0 });
  const web = Platform.OS === 'web', rendered = web ? visible || retained : visible;
  useDialogDismiss({ visible, rendered, busy: false, onClose });
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) reduce(value); }).catch(() => { if (live) reduce(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduce);
    return () => { live = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (!web) return;
    let live = true; if (visible) retain(true);
    const animation = Animated.timing(progress, { toValue: visible ? 1 : 0, duration: reduced ? 0 : 200,
      easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start(({ finished }) => { if (live && finished && !visible) retain(false); });
    return () => { live = false; animation.stop(); };
  }, [visible, reduced, progress, web]);
  const restoreScroll = () => body.current?.scrollTo({ y: positions.current[tab], animated: false });
  useEffect(() => { if (visible) body.current?.scrollTo({ y: positions.current[tab], animated: false }); }, [visible, tab]);
  return <Modal visible={rendered} transparent animationType={web ? 'none' : 'fade'} onRequestClose={onClose} onShow={restoreScroll}>
    <SafeAreaView style={[styles.backdrop, { backgroundColor: compact ? palette.card : 'transparent' }]} edges={compact ? ['top', 'left', 'right', 'bottom'] : []}>
      {!compact && <Animated.View accessible={false} style={[StyleSheet.absoluteFill, { backgroundColor: '#071c2b8c', opacity: web ? progress : 1 }]}
        onStartShouldSetResponder={() => true} onResponderRelease={onClose} />}
      <Animated.View accessibilityLabel="الجلسات" accessibilityViewIsModal style={[styles.window,
        compact ? { flex: 1, width: '100%', borderWidth: 0, borderRadius: 0 } : { width: Math.min(850, width - 32), maxHeight: height - 32 },
        { backgroundColor: !compact && theme === 'light' ? 'rgba(255,255,255,0.97)' : palette.card, borderColor: palette.border, opacity: web ? progress : 1,
          ...(web && !compact ? { transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] } : {}) }]}>
        <View style={[styles.header, { borderColor: palette.border, paddingVertical: compact ? 8 : 13,
          paddingHorizontal: compact ? 12 : 18, minHeight: compact ? 62 : undefined, justifyContent: compact ? 'flex-start' : 'space-between' }]}>
          {compact && <DashboardButton iconOnly icon="back" label="إغلاق النافذة" onPress={onClose} />}
          <AppText accessibilityRole="header" style={{ fontFamily: compact ? 'CairoExtraBold' : 'CairoBlack', fontSize: 18, lineHeight: 23 }}>الجلسات</AppText>
          {!compact && <DashboardButton iconOnly icon="close" label="إغلاق النافذة" onPress={onClose} />}
        </View>
        <ScrollView ref={body} keyboardShouldPersistTaps="handled" scrollEventThrottle={50}
          onScroll={event => { positions.current[tab] = event.nativeEvent.contentOffset.y; }} style={{ flexShrink: 1 }}
          contentContainerStyle={{ padding: compact ? 14 : 22 }}>{children}</ScrollView>
      </Animated.View>
      {compact && <StudentBottomNavigation homeActive={false} onHome={onClose} onStore={onStore} />}
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  window: { minWidth: 0, borderWidth: 1, borderRadius: 22, overflow: 'hidden', flexShrink: 1,
    boxShadow: '0 24px 70px rgba(11,25,40,0.24)' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flexShrink: 0, borderBottomWidth: 1 } });
