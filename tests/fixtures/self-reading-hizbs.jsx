import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SelfReadingDialog from '../../src/components/portal/SelfReadingDialog';
import { Button } from '../../src/components/ui/button';
import { resolveMemorizedReading } from '../../server/services/selfReadingAmount.js';
import layout from '../../server/data/quranVerseLineLayout.js';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const parameters = new URLSearchParams(location.search);
const ayahs = layout.map(([key, page]) => {
  const [surah, ayah] = key.split(':').map(Number);
  return { surah, ayah, page, surahName: surah === 5 ? 'المائدة' : surah === 7 ? 'الأعراف' : '' };
});
const memorized = parameters.has('empty') ? [] : [
  { startSurah: 5, startAyah: 1, endSurah: 5, endAyah: 5 },
  ...parameters.has('partial') ? [] : [{ startSurah: 7, startAyah: 1, endSurah: 114, endAyah: 6 }],
];
const entry = { studentId: 1, faces: 10, expectedHizbs: 2, amount: resolveMemorizedReading({ ayahs, memorized, faces: 10, hizbs: 2 }) };
function Fixture() {
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState(null);
  return <main dir="rtl" className="p-4"><Button onClick={() => setOpen(true)}>تسجيل القراءة التجريبية</Button>
    {result && <p>النتيجة التجريبية: {result.completed ? 'قرأ' : 'لم يقرأ'}، مقدار الذاتي {entry.amount.faces} أوجه</p>}
    <SelfReadingDialog entry={open ? entry : null} studentName="طالب تجريبي" chapters={[{ number: 1, name: 'الفاتحة' }, { number: 2, name: 'البقرة' }, { number: 87, name: 'الأعلى' }]}
      onOpenChange={setOpen} onSave={value => { setResult(value); setOpen(false); }} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
