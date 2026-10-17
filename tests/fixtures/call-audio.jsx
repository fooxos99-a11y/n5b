import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AudioCallRoom from '../../src/components/calls/AudioCallRoom';
import { studentsApi } from '../../src/services/studentsApi';
import { Button } from '../../src/components/ui/button';
import { Toaster } from '../../src/components/ui/toaster';
import { DisconnectReason, Room, RoomEvent } from './call-audio-livekit.js';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
let finishToken;
let tokenRequests = 0, tokenConsent = false;
const consentRequired = new URLSearchParams(location.search).has('consent');
const staleConsent = new URLSearchParams(location.search).has('staleConsent');
globalThis.callAudioFixture = { stats: () => ({ rooms: Room.instances.length, connections: Room.instances.reduce((sum, room) => sum + room.connections, 0), disconnections: Room.instances.reduce((sum, room) => sum + room.disconnections, 0), tokenRequests, tokenConsent }) };
studentsApi.getCallToken = (_id, options) => {
  tokenRequests++;
  tokenConsent = options?.recordingConsent === true;
  if (staleConsent && !tokenConsent) return Promise.reject(Object.assign(new Error('Recording consent required'), { status: 422, data: { code: 'recording_consent_required' } }));
  return new Promise(resolve => { finishToken = () => resolve({ serverUrl: 'wss://local-test.invalid', token: 'synthetic' }); });
};
studentsApi.leaveCallRoom = async () => ({});
studentsApi.closeCallRoom = async () => ({});
studentsApi.getCallRooms = async () => ({ rooms: [{ id: 1 }] });
function Fixture() {
  const [active, setActive] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [revision, setRevision] = useState(0);
  const [roomId, setRoomId] = useState(1);
  const refresh = () => setRevision(value => value + 1);
  const act = work => { work(); refresh(); };
  return <main dir="rtl" className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
    <p role="note" className="rounded-xl border border-border bg-muted p-3 text-sm leading-7">معاينة لسلوك واجهة المكالمة فقط: الاتصال والصوت هنا محاكاة محلية، ولا يُفتح ميكروفون أو يُسجّل صوت. تجربة المكالمة البشرية الفعلية تحتاج إعداد LiveKit وEgress.</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => act(() => finishToken?.())}>إكمال الاتصال التجريبي</Button>
      <Button onClick={refresh}>تحديث الأب</Button>
      <Button onClick={() => setMinimized(value => !value)}>تصغير أو استعادة</Button>
      <Button onClick={() => act(() => { const room = Room.instances.at(-1); room?.subscribe(); room?.subscribe(); })}>إضافة الصوت مرتين</Button>
      <Button onClick={() => act(() => Room.instances.at(-1)?.unsubscribe())}>إزالة الصوت</Button>
      <Button onClick={() => setActive(value => !value)}>خروج أو دخول</Button>
      <Button onClick={() => act(() => Room.instances.at(-1)?.emit(RoomEvent.Disconnected))}>قطع الاتصال التجريبي</Button>
      <Button onClick={() => act(() => Room.instances.at(-1)?.emit(RoomEvent.Reconnecting))}>بدء إعادة الاتصال</Button>
      <Button onClick={() => act(() => Room.instances.at(-1)?.emit(RoomEvent.Reconnected))}>اكتمال إعادة الاتصال</Button>
      <Button onClick={() => act(() => Room.instances.at(-1)?.emit(RoomEvent.Disconnected, DisconnectReason.ROOM_DELETED))}>إغلاق الغرفة من الخادم</Button>
      <Button onClick={() => { Room.failNextConnection = true; }}>إفشال الاتصال التالي</Button>
      <Button onClick={() => { studentsApi.leaveCallRoom = () => new Promise(() => {}); }}>تأخير إشعار الخروج</Button>
      <Button onClick={() => setRoomId(value => value === 1 ? 2 : 1)}>تبديل غرفة الاختبار</Button>
    </div>
    <output aria-label="إحصاءات الفحص">تحديث {revision} · غرف {Room.instances.length} · اتصالات {Room.instances.reduce((sum, room) => sum + room.connections, 0)} · خروج {Room.instances.reduce((sum, room) => sum + room.disconnections, 0)} · رموز {tokenRequests} · موافقة {String(tokenConsent)}</output>
    {active && <AudioCallRoom roomInfo={{ id: roomId, name: 'اختبار ثبات صوت المكالمة', recording: { consentRequired } }} minimized={minimized} onRestore={() => setMinimized(false)} onLeave={() => setActive(false)} onClosed={() => setActive(false)} />}
    <Toaster />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
