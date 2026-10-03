import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import WeeklySessionSection from '../../src/components/dashboard/grades/WeeklySessionSection';
import TrackSessionSection from '../../src/components/dashboard/grades/TrackSessionSection';
import { gradingApi } from '../../src/services/gradingApi';
import { studentsApi } from '../../src/services/studentsApi';
import { normalizeGradingPolicy, gradingMaxima } from '../../shared/grading-policy.js';
import { evaluateTrackSession, evaluateWeeklySession } from '../../shared/grading-engine.js';
import { getBusinessDate, shiftDateOnly } from '../../shared/business-date.js';
import { currentSessionWeek, sessionPeriod } from '../../shared/session-period.js';
import { Button } from '../../src/components/ui/button';
import { Toaster } from '../../src/components/ui/toaster';
import GradingSettingsPanel from '../../src/components/dashboard/GradingSettingsPanel';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const policy = normalizeGradingPolicy();
const today = getBusinessDate();
const weekStart = shiftDateOnly(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
let grade = {}, queued = null;
const previousWeek = shiftDateOnly(weekStart, -7);
const sessionDays = { track: { [previousWeek]: 0 }, weekly: { [previousWeek]: 0 } };
studentsApi.getCommittees = async () => [];
gradingApi.getPolicy = async () => ({ policy, maxima: gradingMaxima(policy) });
gradingApi.savePolicy = async value => {
  Object.assign(policy, normalizeGradingPolicy(value));
  window.dispatchEvent(new CustomEvent('nukhab-grading-policy-updated'));
  return { policy };
};
gradingApi.prepareTrackTest = async () => ({ attemptToken: 'local-test-only', segments: [
  { source: 'link', max: 10, range: { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 } },
  { source: 'review', max: 10, range: { fromSurah: 2, fromAyah: 6, toSurah: 2, toAyah: 10 } },
] });
gradingApi.getWeek = async ({ component, weekStart: requested } = {}) => {
  const currentSessionDay = policy[component === 'track' ? 'trackSession' : 'weeklySession'].sessionDay ?? 0;
  const currentWeekStart = currentSessionWeek(today, currentSessionDay);
  const selected = requested || currentWeekStart;
  const day = sessionDays[component][selected] ?? currentSessionDay;
  const period = sessionPeriod(selected, day);
  return { weekStart: selected, currentWeekStart, currentSessionDay, sessionDay: day, sessionDays: sessionDays[component],
    periodStart: period.start, periodEnd: period.end, hasPreviousWeek: true, policy, maxima: gradingMaxima(policy),
    students: [{ id: 3, name: 'طالب اختبار', committeeName: 'حلقة الاختبار', grade }] };
};
gradingApi.setWeeklyComponent = payload => new Promise((resolve, reject) => {
  queued = { resolve: () => {
    const detail = payload.component === 'weekly' ? evaluateWeeklySession(policy, payload) : evaluateTrackSession(policy, payload);
    grade = { ...grade, [`${payload.component}Detail`]: detail, [`${payload.component}Session`]: detail };
    sessionDays[payload.component][payload.weekStart] ??= policy[payload.component === 'track' ? 'trackSession' : 'weeklySession'].sessionDay ?? 0;
    resolve({ ok: true }); queued = null;
  }, reject: () => { reject(new Error('رفض تجريبي للحفظ')); queued = null; } };
});
function Fixture() {
  const [component, setComponent] = useState('weekly');
  return <main className="mx-auto max-w-4xl space-y-4 p-3 sm:p-6" dir="rtl">
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setComponent(component === 'weekly' ? 'track' : 'weekly')}>تبديل الجلسة</Button>
      <Button onClick={() => queued?.resolve()}>نجاح الطلب التجريبي</Button><Button variant="outline" onClick={() => queued?.reject()}>رفض الطلب التجريبي</Button></div>
    {component === 'weekly' ? <WeeklySessionSection /> : <TrackSessionSection />}<Toaster />
    <GradingSettingsPanel key={component} section={component} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
