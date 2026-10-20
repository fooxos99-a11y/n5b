import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../../src/components/ui/button';
import TeacherRecitationAction from '../../src/components/portal/TeacherRecitationAction';
import RecitationIdentity from '../../src/components/portal/RecitationIdentity';
import { planTaskAmount } from '../../src/lib/studentPlan';
import { formatContinuousRecitationRange } from '../../src/lib/recitationTaskRanges';
import '../../src/index.css';
import '../../src/components/portal/recitation-reference.css';

if (!import.meta.env.DEV || !['localhost','127.0.0.1'].includes(globalThis.location.hostname)) throw new Error('Local preview only');
const tasks = [
  { name: 'وجه كامل', fromSurah: 6, fromSurahName: 'الأنعام', fromAyah: 131, toSurah: 6, toSurahName: 'الأنعام', toAyah: 137, fromPage: 145, toPage: 145 },
  { name: 'بقية الوجه بعد تسميع الآية الأولى', fromSurah: 6, fromSurahName: 'الأنعام', fromAyah: 132, toSurah: 6, toSurahName: 'الأنعام', toAyah: 137, fromPage: 145, toPage: 145, facePortion: 'remainder' },
  { name: 'بداية الخطة من غافر', fromSurah: 40, fromSurahName: 'غافر', fromAyah: 1, toSurah: 40, toSurahName: 'غافر', toAyah: 7, fromPage: 467, toPage: 467, facePortion: 'remainder' },
];
createRoot(globalThis.document.getElementById('root')).render(<main className="mx-auto max-w-3xl space-y-6 p-4" dir="rtl">
  <h1 className="text-xl font-bold">معاينة محلية ببيانات تجريبية</h1>
  <section className="space-y-3" aria-label="مقادير الطالب">
    <h2 className="text-lg font-bold">الطالب</h2>
    {tasks.map((task,index) => <div key={task.name} className="space-y-2 rounded-xl border p-3">
      <p>{task.name}</p><Button data-testid={`student-${index}`} variant="secondary" className="h-auto whitespace-normal text-right">{planTaskAmount(task)}</Button>
    </div>)}
  </section>
  <section className="recitation-reference recitation-students space-y-3" aria-label="مقادير المعلم">
    <h2 className="text-lg font-bold">المعلم</h2>
    {tasks.map((task,index) => <div key={task.name} className="recitation-reference-card" data-testid={`teacher-${index}`}>
      <RecitationIdentity name={task.name} /><div className="recitation-actions">
        <TeacherRecitationAction slot="saved" label="الحفظ" active showAmount amount={formatContinuousRecitationRange([task])} />
      </div>
    </div>)}
  </section>
</main>);
