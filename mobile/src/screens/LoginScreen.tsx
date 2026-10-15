import { useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import logo from '../../../public/branding/nukhab/nukhab-color.png';
import whiteLogo from '../../../public/branding/nukhab/nukhab-white.png';
import { AppText } from '../components/AppText';
import { ActionButton } from '../components/ActionButton';
import { FormField } from '../components/FormField';
import { LOGIN_NUMBER_MAX_LENGTH, LOGIN_PASSWORD_MAX_LENGTH, normalizeLoginNumber,
  prepareLoginCredentials, type LoginCredentials, type LoginFormErrors } from '../domain/loginForm';
import { ThemeContext, usePalette, useTheme } from '../theme';

export type LoginScreenProps = {
  onLogin: (credentials: LoginCredentials) => void | Promise<void>;
  loading?: boolean; error?: string | null; onRegister?: () => void; onHelp?: () => void;
};

export function LoginScreen({ onLogin, loading = false, error, onRegister, onHelp }: LoginScreenProps) {
  const theme = useTheme();
  return <ThemeContext.Provider value={{ ...theme, theme: 'light' }}><LoginForm onLogin={onLogin} loading={loading}
    error={error} onRegister={onRegister} onHelp={onHelp} /></ThemeContext.Provider>;
}
function LoginForm({ onLogin, loading = false, error, onRegister, onHelp }: LoginScreenProps) {
  const palette = usePalette();
  const dark = useTheme().theme === 'dark';
  const { width, height } = useWindowDimensions(); const wide = width >= 540; const short = height <= 600;
  const numberInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const submitting = useRef(false);
  const [loginNumber, setLoginNumber] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const busy = loading || pending;
  const failure = error || submitError;

  async function submit() {
    if (loading || submitting.current) return;
    const result = prepareLoginCredentials(loginNumber, password);
    if (!result.ok) {
      setErrors(result.errors);
      if (result.errors.loginNumber) numberInput.current?.focus();
      else passwordInput.current?.focus();
      return;
    }
    submitting.current = true;
    setPending(true); setErrors({}); setSubmitError(''); Keyboard.dismiss();
    try { await onLogin(result.credentials); }
    catch { setSubmitError('تعذّر تسجيل الدخول. حاول مرة أخرى.'); }
    finally { submitting.current = false; setPending(false); }
  }

  return <SafeAreaView style={{ flex: 1, backgroundColor: palette.card, overflow: 'hidden' }}>
    <StatusBar style="dark" />
    <View pointerEvents="none" style={[styles.ornament, { top: -290, left: -290, backgroundColor: `${palette.primary}06`, borderColor: `${palette.primary}09` }]} />
    <View pointerEvents="none" style={[styles.ornament, { bottom: -265, right: -290, backgroundColor: `${palette.primary}06`, borderColor: `${palette.primary}09` }]} />
    <View pointerEvents="none" style={{ position: 'absolute', bottom: -203, right: -228, width: 316, height: 316,
      borderRadius: 158, borderWidth: 1, borderColor: `${palette.primary}26` }} />
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scroll}>
        <View style={[styles.content, { maxWidth: wide ? 420 : 400 }]}>
          <View style={[styles.header, { marginBottom: short ? 12 : wide ? 28 : 24 }]}>
            <Image source={dark ? whiteLogo : logo} resizeMode="contain" style={{ width: short ? 64 : wide ? 96 : 88, height: short ? 64 : wide ? 96 : 88, marginBottom: 8 }} accessibilityLabel="شعار نخب" />
            <AppText accessibilityRole="header" style={[styles.title, { fontSize: short ? 22 : wide ? 26 : 24, lineHeight: (short ? 22 : wide ? 26 : 24) * 1.5, color: palette.primary }]}>برنامج نخب التعليمي</AppText>
            <AppText style={{ color: '#92959f', fontFamily: 'CairoMedium', fontSize: 15, lineHeight: 22.5, textAlign: 'center', marginTop: 4 }}>سجل دخولك للمتابعة</AppText>
          </View>
          <FormField label="رقم الدخول" variant="login" required leadingIcon="contact" value={loginNumber} inputRef={numberInput}
            onChangeText={value => { setLoginNumber(normalizeLoginNumber(value)); setErrors(current => ({ ...current, loginNumber: undefined })); setSubmitError(''); }}
            keyboardType="number-pad" inputMode="numeric" autoComplete="username" textContentType="username"
            importantForAutofill="yes" returnKeyType="next" submitBehavior="submit"
            onSubmitEditing={() => passwordInput.current?.focus()} maxLength={LOGIN_NUMBER_MAX_LENGTH}
            editable={!busy} error={errors.loginNumber} placeholder="أدخل رقم الدخول" />
          <View style={{ marginTop: short ? 12 : 18 }}><FormField label="كلمة المرور" variant="login" required value={password} inputRef={passwordInput} password
            onChangeText={value => { setPassword(value); setErrors(current => ({ ...current, password: undefined })); setSubmitError(''); }}
            autoComplete="current-password" textContentType="password" importantForAutofill="yes"
            returnKeyType="done" submitBehavior="submit" onSubmitEditing={() => { void submit(); }}
            maxLength={LOGIN_PASSWORD_MAX_LENGTH} editable={!busy} error={errors.password} placeholder="أدخل كلمة المرور" /></View>
          <Pressable accessibilityRole="button" accessibilityLabel="هل نسيت كلمة المرور؟"
            accessibilityState={{ disabled: busy }} disabled={busy}
            onPress={() => { if (onHelp) onHelp(); else setHelpOpen(true); }}
            style={({ pressed }) => [styles.help, { opacity: busy ? 0.5 : pressed ? 0.7 : 1 }]}>
            <AppText style={{ color: palette.primary, fontSize: 14, lineHeight: 20 }}>هل نسيت كلمة المرور؟</AppText>
          </Pressable>
          {failure ? <View accessibilityRole="alert" accessibilityLiveRegion="polite">
            <AppText style={{ color: palette.error }}>{failure}</AppText>
          </View> : null}
          <ActionButton label={failure ? 'إعادة المحاولة' : 'تسجيل دخول'} variant="login" loading={busy}
            disabled={!loginNumber} onPress={() => { void submit(); }} />
          {onRegister ? <ActionButton label="إنشاء حساب طالب" secondary disabled={busy} onPress={onRegister} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    <Modal visible={helpOpen} transparent animationType="fade" onRequestClose={() => setHelpOpen(false)}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <AppText accessibilityRole="header" style={styles.helpTitle}>تواصل مع الإدارة</AppText>
          <ActionButton label="إغلاق" onPress={() => setHelpOpen(false)} />
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ fill: { flex: 1 },
  scroll: { flexGrow: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: 420, padding: 4 },
  ornament: { position: 'absolute', width: 440, height: 440, borderRadius: 220, borderWidth: 28 },
  header: { alignItems: 'center' },
  title: { fontFamily: 'CairoExtraBold', fontSize: 24, lineHeight: 39, textAlign: 'center' },
  help: { minHeight: 44, marginTop: 6, marginBottom: 10, justifyContent: 'center', alignItems: 'flex-end' },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#00000066' },
  dialog: { width: '100%', maxWidth: 360, padding: 24, gap: 24, borderRadius: 20, borderWidth: 1 },
  helpTitle: { fontFamily: 'CairoBold', fontSize: 20, textAlign: 'center' } });
