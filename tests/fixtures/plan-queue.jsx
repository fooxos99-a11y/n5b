import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentPlansSection from '../../src/components/dashboard/StudentPlansSection';
import StudentPlanProgress from '../../src/components/portal/StudentPlanProgress';
import MetricDetails from '../../src/components/dashboard/reports/MetricDetails';
import { buildReportMetrics } from '../../src/components/dashboard/reports/reportMetrics';
import { Button } from '../../src/components/ui/button';
import { Toaster } from '../../src/components/ui/toaster';
import { studentsApi } from '../../src/services/studentsApi';
import { getBusinessDate } from '../../shared/business-date.js';
import '../../src/index.css';
import '../../src/components/portal/student-plan.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
let mode = 'page';
let plan = { id: 17, track: 'memorization', trackLabel: 'حفظ', startDate: getBusinessDate(), startSurah: 1, startAyah: 1, startPage: 1, endSurah: 1, endAyah: 7, endPage: 1,
  dailyPages: 1, linkPages: 10, reviewPages: 20, reviewHizbs: 1, readingFaces: 10, readingHizbs: 2, progressPercent: 50, priorMemorization: [], queuedRanges: [],
  projectedEndDate: '2026-10-05', progress: { shortageFaces: 1.5 } };
Object.assign(studentsApi, {
  getCommittees: async () => [{ id: 7, name: 'حلقة الاختبار' }],
  getStudentPlans: async () => [{ studentId: 3, studentName: 'طالب اختبار', committeeName: 'حلقة الاختبار', plan }],
  getQuranChapters: async () => [{ number: 1, name: 'الفاتحة', startPage: 1, endPage: 1 }, { number: 2, name: 'البقرة', startPage: 2, endPage: 49 }, { number: 3, name: 'آل عمران', startPage: 50, endPage: 76 }],
  getQuranAyahs: async surah => Array.from({ length: Number(surah) === 1 ? 7 : 30 }, (_, index) => ({ ayah: index + 1, page: Number(surah) === 1 ? 1 : Number(surah) === 2 ? 2 : 50 })),
  getQuranJuzRanges: async () => [], getPublicSettings: async () => ({ quranReferenceMode: mode, weeklyHolidayDays: [5, 6] }),
  saveStudentPlan: async (_id, payload) => { plan = { ...plan, ...payload, trackLabel: payload.track === 'mastery' ? 'إتقان' : 'حفظ' }; return { ok: true }; },
  closeStudentPlan: async () => { plan = { ...plan, ...plan.queuedRanges[0], queuedRanges: plan.queuedRanges.slice(1) }; return { ok: true }; },
});
function Fixture() {
  const [version, setVersion] = useState(0);
  const [details, setDetails] = useState(false);
  const metric = buildReportMetrics({ totals: { quranFaces: { memorization: 1, mastery: 2, review: 3, link: 4 } }, grades: { weeklyProgram: {} }, committeeIndicators: [{ name: 'حلقة الاختبار', students: [{ id: 3, name: 'طالب اختبار', metrics: { memorization: { done: 1, total: 1 }, mastery: { done: 2, total: 3 } } }] }] })[0];
  return <main className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6" dir="rtl">
    <Button variant="outline" onClick={() => { mode = mode === 'page' ? 'ayah' : 'page'; setVersion(current => current + 1); }}>تبديل مرجع القرآن</Button>
    <Button variant="outline" onClick={() => setDetails(true)}>تفاصيل البرنامج</Button>
    <StudentPlansSection key={version} /><div className="student-plan"><StudentPlanProgress plan={plan} /></div><Toaster />
    <MetricDetails metric={details ? metric : null} periodLabel="فترة اختبار" onClose={() => setDetails(false)} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
