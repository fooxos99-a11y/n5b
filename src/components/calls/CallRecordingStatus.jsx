import React, { useEffect, useState } from 'react';
import { studentsApi } from '@/services/studentsApi';
import { recordingLabel } from '@/lib/callArchivePresentation';

export default function CallRecordingStatus({ roomId, initialRecording }) {
  const [recording, setRecording] = useState(initialRecording);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try { const data = await studentsApi.getCallRooms(); const room = data.rooms?.find(item => String(item.id) === String(roomId)); if (alive && room?.recording) { setRecording(room.recording); setStale(false); } }
      catch { if (alive) setStale(true); }
    };
    void load(); const timer = window.setInterval(load, 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [roomId]);
  if (!recording) return null;
  return <p role="status" className={`rounded-lg px-3 py-2 text-sm ${recording.state === 'recording' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{stale ? 'تعذر تحديث حالة التسجيل.' : recordingLabel(recording.state)}{recording.recordingGap ? ' · قد يكون التسجيل غير مكتمل' : ''}</p>;
}
