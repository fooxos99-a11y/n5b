import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Linking, Platform, StyleSheet, View } from 'react-native';
import { ActionButton } from './components/ActionButton';
import { AppText } from './components/AppText';
import { createNativeSession, nativeExternalActivityPending } from './domain/nativeSession';
import { configuredRegistrationEntry, registrationEntryFromUrl, type RegistrationEntry } from './domain/nativeNavigation';
import { decodePublicRegistrationConfiguration, decodeRegistrationSubmissionResult, type RegistrationRequestPayload } from './domain/registrationForm';
import { createNativeApi, configuredNativeApiBase, NativeApiError, type NativeApi } from './services/nativeApi';
import { createSessionStorage } from './services/sessionStorage';
import { NativeDashboard } from './NativeDashboard';
import { LoginScreen } from './screens/LoginScreen';
import { RegistrationScreen } from './screens/RegistrationScreen';
import { usePalette } from './theme';

function SessionGate({ api }: { api: NativeApi }) {
  const palette = usePalette();
  const [controller] = useState(() => createNativeSession({ api, storage: createSessionStorage() }));
  const [snapshot, setSnapshot] = useState(controller.getSnapshot);
  const [entry, setEntry] = useState<RegistrationEntry | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const defaultEntry = useRef(configuredRegistrationEntry(process.env.EXPO_PUBLIC_REGISTRATION_NUMBER));
  const restoreSession = useCallback(() => {
    // The controller publishes the failure state; observe the rejection to avoid an unhandled promise.
    void controller.restore().catch(error => {
      if (!(error instanceof NativeApiError)) setNotice('تعذّر التحقق من جلسة الدخول.');
    });
  }, [controller]);
  const loadRegistration = useCallback((registrationNumber: string, signal?: AbortSignal) =>
    api.request(`/registration/public?registrationNumber=${encodeURIComponent(registrationNumber)}`,
      { registrationNumber, signal }, decodePublicRegistrationConfiguration), [api]);
  const submitRegistration = useCallback((payload: RegistrationRequestPayload, registrationNumber: string, signal?: AbortSignal) =>
    api.request('/registration/public', { method: 'POST', body: { ...payload, registrationNumber },
      registrationNumber, signal }, decodeRegistrationSubmissionResult), [api]);

  useEffect(() => {
    const unsubscribe = controller.subscribe(() => setSnapshot(controller.getSnapshot()));
    restoreSession();
    const appState = AppState.addEventListener('change', value => {
      if (value === 'active' && controller.getSnapshot().status === 'authenticated'
        && !nativeExternalActivityPending(controller)) restoreSession();
    });
    return () => { unsubscribe(); appState.remove(); controller.cancel(); };
  }, [controller, restoreSession]);

  useEffect(() => {
    let active = true;
    const chooseEntry = (url: string | null) => {
      const requested = registrationEntryFromUrl(url, api.baseUrl);
      if (active && requested) setEntry(requested);
    };
    void Linking.getInitialURL().then(chooseEntry).catch(() => undefined);
    const listener = Linking.addEventListener('url', event => chooseEntry(event.url));
    return () => { active = false; listener.remove(); };
  }, [api]);

  useEffect(() => {
    if (!defaultEntry.current) return;
    const abort = new AbortController();
    void api.request(`/registration/public?registrationNumber=${encodeURIComponent(defaultEntry.current.registrationNumber)}`,
      { registrationNumber: defaultEntry.current.registrationNumber, signal: abort.signal }, decodePublicRegistrationConfiguration)
      .then(configuration => { if (!abort.signal.aborted) setRegistrationOpen(configuration.enabled); })
      .catch(() => { if (!abort.signal.aborted) setRegistrationOpen(false); });
    return () => abort.abort();
  }, [api]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!entry) return false;
      setEntry(null); return true;
    });
    return () => listener.remove();
  }, [entry]);

  async function logout() {
    setEntry(null); setNotice('');
    const result = await controller.logout();
    if (controller.getSnapshot().status !== 'signed-out') return;
    if (!result.localCleared) setNotice('تعذّر مسح الجلسة بأمان. حاول تسجيل الخروج مجددًا.');
    else if (!result.serverRevoked) setNotice('خرجت من هذا الجهاز. تعذّر تأكيد إنهاء الجلسة على الخادم.');
  }

  if (entry) return <RegistrationScreen key={entry.registrationNumber} registrationNumber={entry.registrationNumber}
    onBack={() => setEntry(null)} loadRegistration={loadRegistration} submitRegistration={submitRegistration} />;

  if (snapshot.status === 'restoring') return <View style={styles.waiting}>
    <ActivityIndicator color={palette.primary} /><AppText>جارٍ التحقق من جلسة الدخول</AppText>
  </View>;

  if (snapshot.status === 'authenticated' && snapshot.session) return <NativeDashboard
    key={`${snapshot.session.complex.registrationNumber}:${snapshot.session.role}:${snapshot.session.id}`} session={snapshot.session} controller={controller}
    onLogout={() => { void logout(); }} onRefresh={restoreSession} />;

  if (snapshot.status === 'offline') return <View style={styles.waiting}>
    <AppText accessibilityRole="alert">تعذّر التحقق من الجلسة. تحقق من اتصالك ثم أعد المحاولة.</AppText>
    <ActionButton label="إعادة المحاولة" onPress={restoreSession} />
    <ActionButton label="تسجيل الخروج" secondary onPress={() => { void logout(); }} />
  </View>;

  return <LoginScreen loading={snapshot.status === 'signing-in'} error={notice || snapshot.error?.message}
    onLogin={credentials => { setNotice(''); return controller.login({ ...credentials,
      registrationNumber: defaultEntry.current?.registrationNumber }); }}
    onRegister={registrationOpen && defaultEntry.current ? () => setEntry(defaultEntry.current) : undefined} />;
}

export function NativeAppGate() {
  const palette = usePalette();
  const [configuration] = useState(() => {
    try { return { api: createNativeApi({ baseUrl: configuredNativeApiBase() }), error: null }; }
    catch (error) { return { api: null, error: error instanceof NativeApiError ? error.message : 'تعذّر الاتصال بالخدمة.' }; }
  });
  if (!configuration.api) return <View style={styles.waiting}>
    <AppText accessibilityRole="alert" style={{ color: palette.error }}>{configuration.error}</AppText>
  </View>;
  return <SessionGate api={configuration.api} />;
}
const styles = StyleSheet.create({ waiting: { flex: 1, padding: 24, gap: 20, alignItems: 'center', justifyContent: 'center' } });
