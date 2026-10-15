import { useRef, useState } from 'react';
import { View } from 'react-native';
import { openEncryptedProbeStore } from '../services/encryptedProbeStore';
import type { ProbeRecord } from '../domain/probeStore';
import { atProbeStage, formatProbeFailure } from '../domain/probeFailure';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ProbeCard } from '../components/ProbeCard';
import { usePalette } from '../theme';

const FIXTURE_ID = 'w01-synthetic-recitation-v1';
export function StorageProbe() {
  const palette = usePalette();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState('لا توجد نتيجة فحص بعد.');
  const [error, setError] = useState(false);
  async function run(mode: 'save' | 'restore') {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError(false);
    try {
      const handle = await openEncryptedProbeStore();
      try {
        if (mode === 'save') {
          const records: ProbeRecord[] = ['draft', 'session'].map(kind => ({ kind: kind as ProbeRecord['kind'],
            operationId: FIXTURE_ID, selectedLocations: ['1:1:1', '1:1:2'], createdAt: new Date().toISOString() }));
          await atProbeStage('save-records', () => handle.store.save(records));
          await handle.verifyIsolation(FIXTURE_ID);
          setMessage('حُفظت المسودة والجلسة، واجتاز فصل الحساب والجهة. أغلق التطبيق ثم أعد فتحه لفحص الاستعادة.');
        } else {
          const draft = await atProbeStage('restore-draft', () => handle.store.restore('draft', FIXTURE_ID));
          const session = await atProbeStage('restore-session', () => handle.store.restore('session', FIXTURE_ID));
          if (!draft || !session) setMessage('لا توجد مسودة وجلسة محفوظتان. احفظ التجربة أولًا.');
          else {
            await handle.verifyIsolation(FIXTURE_ID);
            setMessage(`استُعيدت المسودة والجلسة، واجتاز فصل الحساب والجهة. تاريخ الحفظ: ${new Date(session.createdAt).toLocaleString('ar-SA')}`);
          }
        }
      } finally { await handle.close(); }
    } catch (cause) {
      setError(true);
      setMessage(formatProbeFailure(cause));
    } finally { locked.current = false; setBusy(false); }
  }
  return <ProbeCard title="التخزين المشفر">
    <AppText style={{ color: palette.muted }}>تجربة مستقلة ببيانات مصطنعة، دون بيانات الطلاب.</AppText>
    <View style={{ gap: 10 }}>
      <ActionButton label="حفظ التجربة" loading={busy} onPress={() => { void run('save'); }} />
      <ActionButton label="استعادة التجربة" secondary disabled={busy} onPress={() => { void run('restore'); }} />
    </View>
    <AppText accessibilityLiveRegion="polite" style={error ? { color: palette.error } : undefined}>{message}</AppText>
  </ProbeCard>;
}
