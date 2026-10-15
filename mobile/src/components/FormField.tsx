import { useId, useState, type Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';
import { AppText } from './AppText';
import { usePalette } from '../theme';
import { DashboardIcon, type DashboardGlyph } from './dashboard/DashboardIcon';

export type FormFieldProps = Omit<TextInputProps, 'style' | 'secureTextEntry'> & {
  label: string; error?: string; hint?: string; password?: boolean; inputRef?: Ref<TextInput>;
  variant?: 'default' | 'login'; required?: boolean; leadingIcon?: DashboardGlyph;
  hideLabel?: boolean; compact?: boolean;
};

export function FormField({ label, error, hint, password = false, inputRef, variant = 'default', required = false, leadingIcon, hideLabel = false, compact = false,
  onFocus, onBlur, editable = true, accessibilityLabel, accessibilityHint, ...inputProps }: FormFieldProps) {
  const palette = usePalette();
  const { width } = useWindowDimensions(); const login = variant === 'login'; const height = compact ? 44 : login && width >= 540 ? 50 : 48;
  const labelId = useId();
  const [focused, setFocused] = useState(false);
  const [toggleFocused, setToggleFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  return <View style={styles.field}>
    {!hideLabel && <AppText nativeID={labelId} style={[styles.label, login && { fontFamily: 'CairoSemi', fontSize: 15, lineHeight: 22.5, color: palette.primary }]}>{label}
      {required && <Text aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ color: '#e43743' }}> *</Text>}</AppText>}
    <View style={[styles.inputFrame, { backgroundColor: palette.card, minHeight: inputProps.multiline ? 128 : height,
      borderColor: error ? palette.error : focused ? `${palette.primary}8c` : login ? '#e5e6e9' : palette.border,
      boxShadow: focused ? `0 0 0 4px ${palette.primary}1a` : '0 1px 2px rgba(31, 51, 71, 0.025)',
      opacity: editable ? 1 : 0.65 }]}>
      <TextInput {...inputProps} ref={inputRef} editable={editable}
        accessibilityLabel={accessibilityLabel ?? label} accessibilityLabelledBy={hideLabel || required || accessibilityLabel ? undefined : labelId}
        accessibilityHint={error ?? accessibilityHint ?? hint}
        accessibilityState={{ disabled: !editable }}
        secureTextEntry={password && !visible} placeholderTextColor={login ? '#999da7' : palette.muted}
        autoCapitalize={inputProps.autoCapitalize ?? 'none'} autoCorrect={inputProps.autoCorrect ?? false}
        onFocus={event => { setFocused(true); onFocus?.(event); }}
        onBlur={event => { setFocused(false); onBlur?.(event); }}
        style={[styles.input, { minHeight: inputProps.multiline ? 126 : height - 2, textAlignVertical: inputProps.multiline ? 'top' : 'center',
          writingDirection: password || ['phone-pad', 'number-pad', 'decimal-pad', 'numeric', 'email-address'].includes(inputProps.keyboardType ?? '') ? 'ltr' : 'auto',
          color: login ? palette.primary : palette.text }]} />
      {!!leadingIcon && !password && <View style={styles.leadingIcon}><DashboardIcon name={leadingIcon} size={20} color="#9397a2" /></View>}
      {password ? <Pressable accessibilityRole="button"
        accessibilityLabel={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        accessibilityState={{ disabled: !editable, selected: visible }} disabled={!editable}
        onFocus={() => setToggleFocused(true)} onBlur={() => setToggleFocused(false)}
        onPress={() => setVisible(current => !current)}
        style={({ pressed }) => [styles.toggle, { borderColor: toggleFocused ? palette.primary : 'transparent',
          opacity: pressed ? 0.7 : 1 }]}>
        <DashboardIcon name={visible ? 'eyeOff' : 'eye'} size={20} color={login ? '#9397a2' : palette.muted} />
      </Pressable> : null}
    </View>
    {error ? <AppText accessibilityLiveRegion="polite" style={{ color: palette.error, fontSize: 13 }}>{error}</AppText>
      : hint ? <AppText style={{ color: palette.muted, fontSize: 13 }}>{hint}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({ field: { gap: 6, minWidth: 0 },
  label: { fontFamily: 'CairoBold', fontSize: 14, lineHeight: 20 },
  inputFrame: { direction: 'ltr', flexDirection: 'row-reverse', alignItems: 'center',
    borderWidth: 1, borderRadius: 12, minHeight: 48 },
  input: { flex: 1, minWidth: 0, minHeight: 46, paddingHorizontal: 16, paddingVertical: 8,
    fontFamily: 'Cairo', fontSize: 16, textAlign: 'right' },
  leadingIcon: { width: 48, borderRightWidth: 1, borderColor: '#e5e6e9', alignItems: 'center', justifyContent: 'center' },
  toggle: { minWidth: 44, minHeight: 44, borderWidth: 2, borderRadius: 10,
    marginHorizontal: 2, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 } });
