import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import AudioCallRoom from '../../src/components/calls/AudioCallRoom';
import { studentsApi } from '../../src/services/studentsApi';
import { Button } from '../../src/components/ui/button';
import { Toaster } from '../../src/components/ui/toaster';
import { Room } from './call-audio-livekit.js';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
let finishToken;
studentsApi.getCallToken = () => new Promise(resolve => { finishToken = () => resolve({ serverUrl: 'wss://local-test.invalid', token: 'synthetic' }); });
studentsApi.leaveCallRoom = async () => ({});
studentsApi.closeCallRoom = async () => ({});
function Fixture() {
  const [active, setActive] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision(value => value + 1);
  const act = work => { work(); refresh(); };
  return <main dir="rtl" className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => act(() => finishToken?.())}>إكمال الاتصال التجريبي</Button>
      <Button onClick={refresh}>تحديث الأب</Button>
      <Button onClick={() => setMinimized(value => !value)}>تصغير أو استعادة</Button>
      <Button onClick={() => act(() => { const room = Room.instances.at(-1); room?.subscribe(); room?.subscribe(); })}>إضافة الصوت مرتين</Button>
      <Button onClick={() => act(() => Room.instances.at(-1)?.unsubscribe())}>إزالة الصوت</Button>
      <Button onClick={() => setActive(value => !value)}>خروج أو دخول</Button>
    </div>
    <output aria-label="إحصاءات الفحص">تحديث {revision} · غرف {Room.instances.length} · اتصالات {Room.instances.reduce((sum, room) => sum + room.connections, 0)} · خروج {Room.instances.reduce((sum, room) => sum + room.disconnections, 0)}</output>
    {active && <AudioCallRoom roomInfo={{ id: 1, name: 'اختبار ثبات صوت المكالمة' }} minimized={minimized} onRestore={() => setMinimized(false)} onLeave={() => setActive(false)} onClosed={() => setActive(false)} />}
    <Toaster />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
