import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../theme';

export type AnchoredPopoverProps = {
  visible: boolean; onClose: () => void; label: string; trigger: ReactNode; children: ReactNode;
  width: number; align?: 'start' | 'center' | 'end'; busy?: boolean; autoFocus?: boolean; edgeGap?: number;
  padding?: number; borderRadius?: number;
};
type Anchor = { x: number; y: number; width: number; height: number };

export function AnchoredPopover({ visible, onClose, label, trigger, children, width: desiredWidth,
  align = 'end', busy = false, edgeGap = 8, padding = 6, borderRadius = 16 }: AnchoredPopoverProps) {
  const palette = usePalette(); const window = useWindowDimensions(); const insets = useSafeAreaInsets();
  const anchor = useRef<View>(null); const [bounds, setBounds] = useState<Anchor | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  useLayoutEffect(() => {
    if (!visible) return;
    let live = true;
    anchor.current?.measureInWindow((x, y, width, height) => {
      if (live && width > 0 && height > 0) setBounds({ x, y, width, height });
    });
    return () => { live = false; };
  }, [visible, window.width, window.height, insets.top, insets.right, insets.bottom, insets.left]);
  const leftEdge = insets.left + edgeGap, rightEdge = insets.right + edgeGap;
  const width = Math.min(desiredWidth, window.width - leftEdge - rightEdge);
  const topEdge = insets.top + edgeGap, bottomEdge = insets.bottom + edgeGap;
  const maxHeight = Math.max(44, window.height - topEdge - bottomEdge);
  const naturalLeft = bounds ? align === 'center' ? bounds.x + (bounds.width - width) / 2
    : align === 'end' ? bounds.x : bounds.x + bounds.width - width : leftEdge;
  const left = Math.max(leftEdge, Math.min(window.width - rightEdge - width, naturalLeft));
  const naturalTop = (bounds?.y ?? topEdge) + (bounds?.height ?? 0) + 6;
  const height = Math.min(contentHeight, maxHeight);
  const top = naturalTop + height <= window.height - bottomEdge ? naturalTop
    : Math.max(topEdge, (bounds?.y ?? topEdge) - height - 6);
  const close = () => { if (!busy) onClose(); };
  return <View ref={anchor} collapsable={false} style={{ minWidth: 0 }}>
    {trigger}
    <Modal visible={visible && !!bounds} transparent animationType="fade" onRequestClose={close}>
      <View style={StyleSheet.absoluteFill}>
        <View accessible={false} style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} onResponderRelease={close} />
        <View accessibilityLabel={label} accessibilityViewIsModal style={{ position: 'absolute', left, top, width, maxHeight,
          borderWidth: 1, borderColor: palette.border, borderRadius, backgroundColor: palette.card, overflow: 'hidden',
          boxShadow: '0 14px 35px rgba(23,38,54,0.16)' }}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ padding }}
            onContentSizeChange={(_, height) => setContentHeight(height)}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  </View>;
}
