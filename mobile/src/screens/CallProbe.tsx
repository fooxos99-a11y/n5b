import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AudioSession, LiveKitRoom, VideoTrack, isTrackReference, useConnectionState,
  useLocalParticipant, useTracks } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { validCallGrant, type CallGrant } from '../domain/callGrant';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ProbeCard } from '../components/ProbeCard';
import { usePalette } from '../theme';

function RoomControls({ onLeave }: { onLeave: () => void }) {
  const connection = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera]);
  const [failure, setFailure] = useState('');
  async function toggle(kind: 'microphone' | 'camera') {
    setFailure('');
    try {
      if (kind === 'microphone') await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      else await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch { setFailure('تعذّر تشغيل الكاميرا أو الميكروفون. تحقق من أذونات الجهاز.'); }
  }
  return <View style={styles.controls}>
    <AppText>حالة الاتصال: {connection}</AppText>
    {tracks.filter(isTrackReference).map(track => <VideoTrack key={`${track.participant.identity}-${track.source}`}
      trackRef={track} style={styles.video} />)}
    <ActionButton label={isMicrophoneEnabled ? 'إيقاف الميكروفون' : 'تشغيل الميكروفون'} onPress={() => { void toggle('microphone'); }} />
    <ActionButton label={isCameraEnabled ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'} onPress={() => { void toggle('camera'); }} />
    <ActionButton label="مغادرة المكالمة" secondary onPress={onLeave} />
    {failure ? <AppText accessibilityLiveRegion="polite">{failure}</AppText> : null}
  </View>;
}
function ConnectedRoom({ grant, onLeave }: { grant: CallGrant; onLeave: () => void }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void AudioSession.startAudioSession().then(() => {
      if (active) setReady(true);
      else void AudioSession.stopAudioSession();
    }).catch(() => { if (active) setError('تعذّر بدء الصوت. تحقق من أذونات الجهاز.'); });
    return () => { active = false; void AudioSession.stopAudioSession(); };
  }, []);
  if (!ready) return <><AppText>{error || 'جارٍ تجهيز الصوت…'}</AppText>
    <ActionButton label="إلغاء" secondary onPress={onLeave} /></>;
  return <LiveKitRoom serverUrl={grant.serverUrl} token={grant.token} connect audio video
    options={{ adaptiveStream: { pixelDensity: 'screen' } }} onDisconnected={onLeave}
    onError={() => setError('تعذّر الاتصال بالمكالمة. تحقق من جلسة الاختبار والاتصال.')}>
    <RoomControls onLeave={onLeave} />
    {error ? <AppText accessibilityLiveRegion="polite">{error}</AppText> : null}
  </LiveKitRoom>;
}

export function CallProbe({ grant = null }: { grant?: CallGrant | null }) {
  const palette = usePalette();
  const [active, setActive] = useState(false);
  const available = validCallGrant(grant);
  return <ProbeCard title="المكالمة">
    {active && available ? <ConnectedRoom grant={grant} onLeave={() => setActive(false)} /> : <>
      <AppText style={{ color: palette.muted }}>تحتاج التجربة إلى جلسة اختبار مخولة من الخادم.</AppText>
      <ActionButton label="بدء المكالمة" disabled={!available} onPress={() => setActive(true)} />
      {!available ? <AppText>المكالمة غير متصلة. ربط حساب الاختبار بالخادم لم يكتمل بعد.</AppText> : null}
    </>}
  </ProbeCard>;
}
const styles = StyleSheet.create({ controls: { gap: 12 }, video: { width: '100%', height: 220, borderRadius: 16 } });
