import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SelfReadingDialog from '../../src/components/portal/SelfReadingDialog';
import { Button } from '../../src/components/ui/button';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const entry = { studentId: 1, faces: 10, amount: { faces: 10, hizbCount: 1, ranges: [{ startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7, startSurahName: 'الفاتحة' }, { startSurah: 2, startAyah: 1, endSurah: 2, endAyah: 69, startSurahName: 'البقرة' }] } };
function Fixture() {
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState(null);
  return <main dir="rtl" className="p-4"><Button onClick={() => setOpen(true)}>تسجيل القراءة التجريبية</Button>
    {result && <p>النتيجة التجريبية: {result.completed ? 'قرأ' : 'لم يقرأ'}، مقدار الذاتي 10 أوجه</p>}
    <SelfReadingDialog entry={open ? entry : null} studentName="طالب تجريبي" chapters={[{ number: 1, name: 'الفاتحة' }, { number: 2, name: 'البقرة' }, { number: 87, name: 'الأعلى' }]}
      onOpenChange={setOpen} onSave={value => { setResult(value); setOpen(false); }} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
