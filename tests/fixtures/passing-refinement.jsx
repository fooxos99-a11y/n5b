import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from '@/lib/router';
import PassingSection from '@/components/dashboard/passing/PassingSection';
import PublicRegistration from '@/pages/PublicRegistration';
import MetricCard from '@/components/dashboard/reports/MetricCard';
import { buildReportMetrics } from '@/components/dashboard/reports/reportMetrics';
import { studentsApi } from '@/services/studentsApi';
import { buildPassingReport } from '../../shared/passing-report.js';
import '@/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const student = { id: 11, name: 'طالب المعاينة', complexId: 1, complexName: 'مجمع النور', committeeId: 7, committeeName: 'حلقة الفجر' };
const attempt = (id, score) => ({ id, createdAt: '2026-10-22T08:00:00', actorName: 'المقرئ المحلي', result: { score, maxScore: 100, percentage: score, passed: score >= 85, rating: 'جيد', mistakeCount: 0, warningCount: 0 }, policy: {}, marks: [] });
const exams = [{ id: 1, type: 'branch', parts: [{ juzNumber: 1, attempts: [attempt(2, 80), attempt(1, 50)] }] },
  { id: 2, type: 'hafiz', parts: [{ juzNumber: 1, attempts: [attempt(3, 40)] }] }];
window.__reportTypes = [];
const api = { students: async () => [student], studentParts: async (_id, type) => ({ parts: [{ juzNumber: 1 }], exams: exams.filter(exam => exam.type === type) }),
  studentReport: async (_id, type) => {
    window.__reportTypes.push(type);
    if (window.__reportFail) { window.__reportFail = false; throw new Error('تعذر تحميل التقرير التجريبي.'); }
    return buildPassingReport(exams.filter(exam => exam.type === type), [{ juzNumber: 1 }]);
  } };
Object.assign(studentsApi, {
  getPublicRegistration: async () => ({ enabled: true, complexes: [{ id: 1, name: 'مجمع النور' }, { id: 2, name: 'مجمع آخر' }], committees: [{ id: 7, name: 'حلقة الفجر', complexId: 1 }], juzRanges: [] }),
  submitPublicRegistration: async body => { window.__registrationBody = body; if (window.__registrationFail) throw new Error('تعذر إرسال الطلب التجريبي.'); return { ok: true }; },
});
const overview = Object.fromEntries(['branchPassing', 'hafizPassing'].map((id, index) => [id, { metric: 'result_average', percentage: index ? 40 : 85, expected: 3, tested: 2, passedParts: 2, studentsList: [] }]));
const metrics = buildReportMetrics(overview).filter(metric => ['branchPassing', 'hafizPassing'].includes(metric.id));
const registration = new URLSearchParams(location.search).has('registration');
createRoot(document.getElementById('root')).render(<BrowserRouter>{registration ? <PublicRegistration /> : <main dir="rtl" className="mx-auto max-w-5xl space-y-4 p-3 sm:p-6">
  <div className="grid grid-cols-2 gap-3">{metrics.map(metric => <MetricCard key={metric.id} metric={metric} onSelect={() => {}} />)}</div>
  <PassingSection api={api} /></main>}</BrowserRouter>);
