import { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DashboardButton } from './dashboard/DashboardButton';
import { AppText } from './AppText';
import { usePalette } from '../theme';
import { useDialogDismiss } from './dialogDismiss';

const AnimatedDialog = Animated.createAnimatedComponent(KeyboardAvoidingView);
export const DialogPresentationContext = createContext(false);

function useDialogTransition(visible: boolean) {
  const progress = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(visible);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReducedMotion(value); })
      .catch(() => { if (live) setReducedMotion(true); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { live = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let live = true;
    if (visible) setRendered(true);
    const animation = Animated.timing(progress, { toValue: visible ? 1 : 0, duration: reducedMotion ? 0 : 200,
      easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start(({ finished }) => { if (live && finished && !visible) setRendered(false); });
    return () => { live = false; animation.stop(); };
  }, [visible, reducedMotion, progress]);
  return { rendered: visible || rendered, progress };
}

export function FormDialog({ visible, title, children, onClose, busy = false, footer, maxWidth = 512, showClose = true, titleColor }: {
  visible: boolean; title: string; children: ReactNode; onClose: () => void; busy?: boolean; footer?: ReactNode;
  maxWidth?: number; showClose?: boolean; titleColor?: string;
}) {
  const palette = usePalette();
  const { width, height } = useWindowDimensions(); const padding = width < 640 ? 12 : 24;
  const web = Platform.OS === 'web'; const transition = useDialogTransition(visible);
  const [presented, setPresented] = useState(false);
  const close = () => { if (!busy) onClose(); };
  useDialogDismiss({ visible, rendered: web ? transition.rendered : visible, busy, onClose });
  // RN Web activates its modal stack only after the built-in fade. Animate the
  // content separately so Escape always addresses the newly opened dialog.
  return <Modal visible={web ? transition.rendered : visible} transparent animationType={web ? 'none' : 'fade'} onRequestClose={close}
    onShow={() => setPresented(true)} onDismiss={() => setPresented(false)}>
    <SafeAreaView style={[styles.backdrop, { padding: width < 640 ? 8 : 16 }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#071c2b8c', opacity: web ? transition.progress : 1 }]}
        accessible={false} importantForAccessibility="no" onStartShouldSetResponder={() => true} onResponderRelease={close} />
      <AnimatedDialog style={[styles.dialog, { backgroundColor: palette.card, borderColor: palette.border,
        ...(web ? { opacity: transition.progress, transform: [{ scale: transition.progress.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
          { translateY: transition.progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] } : {}),
        padding, gap: width < 640 ? 12 : 16, maxWidth, maxHeight: height - (width < 640 ? 16 : 32) }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} accessibilityViewIsModal>
        <View style={styles.header}><AppText accessibilityRole="header" style={[styles.title, titleColor ? { color: titleColor } : undefined]}>{title}</AppText>
          {showClose && <DashboardButton label="إغلاق" icon="close" iconOnly disabled={busy} onPress={close} />}</View>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content}>
          <DialogPresentationContext.Provider value={presented}>{children}</DialogPresentationContext.Provider>
        </ScrollView>
        {!!footer && <View style={styles.footer}>{footer}</View>}
      </AnimatedDialog>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({ backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  dialog: { width: '100%', borderWidth: 1, borderRadius: 16, overflow: 'hidden', flexShrink: 1,
    boxShadow: '0 24px 70px rgba(11, 25, 40, 0.24)' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { flex: 1, fontFamily: 'CairoBlack', fontSize: 18, lineHeight: 24 },
  scroll: { flexShrink: 1 }, content: { gap: 16 },
  footer: { flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 } });
