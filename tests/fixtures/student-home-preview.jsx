import '../../src/index.css';
import { computeWeeklyGrade, evaluateReading, evaluateWeeklySession, evaluateTrackSession } from '../../shared/grading-engine.js';
import { normalizeGradingPolicy } from '../../shared/grading-policy.js';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from '../../src/lib/router';
import StudentHome from '../../src/components/portal/home/StudentHome';
import { Toaster } from '../../src/components/ui/toaster';
import { getBusinessDate, shiftDateOnly } from '../../shared/business-date.js';
import { Room } from './call-audio-livekit.js';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname) || location.port !== '3003') throw new Error('Preview requires the isolated local port 3003');
document.title = 'معاينة الطالب — بيانات تجريبية';
document.documentElement.classList.add('light');
localStorage.setItem('wajeh_role', 'student');
localStorage.setItem('wajeh_student_id', 'preview-student');
localStorage.setItem('wajeh_name', 'عبدالله طالب الاختبار');
const date = getBusinessDate();
const range = { fromPage: 5, toPage: 5, fromSurah: 2, toSurah: 2, fromSurahName: 'البقرة', toSurahName: 'البقرة', fromAyah: 25, toAyah: 29 };
const tasks = ['memorization', 'review', 'link'].map((taskType, index) => ({ ...range, id: index + 1, taskType, taskDate: date, sessionDate: date, studentStatus: null, teacherCompleted: null, mistakeCount: index, warningCount: 0 }));
const names = ['عبدالله محمد', 'خالد سليمان', 'أحمد ناصر', 'عمر عبدالرحمن', 'أنس إبراهيم', 'محمد عبدالله', 'يوسف فهد', 'سلمان سعد'];
const settings = { learningPathsEnabled: true, hasStudentQuranExecution: true, pointsSystemEnabled: true, storeEnabled: !new URLSearchParams(location.search).has('storeClosed'), studentRankingsVisible: true, familyRankingsVisible: true, rankingPointsVisible: true };
const weekStart = shiftDateOnly(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
const policy = normalizeGradingPolicy({ trackSession: { sessionDay: 0 }, weeklySession: { sessionDay: 0 } });
const dailyReading = evaluateReading(policy, { completed: true, requiredFaces: 10 });
Object.assign(dailyReading, { range: { startSurah: 2, startAyah: 25, endSurah: 2, endAyah: 29, startSurahName: 'البقرة', endSurahName: 'البقرة' } });
const trackDetail = evaluateTrackSession(policy, { attendanceStatus: 'late', segments: [{ mistakes: 1 }, { warnings: 2 }] });
const weeklyDetail = evaluateWeeklySession(policy, { attendanceStatus: 'present' });
const weeklyGrades = [0, -7].map(offset => {
  const start = shiftDateOnly(weekStart, offset);
  const days = Array.from({ length: 7 }, (_, index) => ({ date: shiftDateOnly(start, index), weekday: index, reading: index === 0 ? { grade: dailyReading.grade } : null }));
  return { weekStart: start, weekEnd: shiftDateOnly(start, 6), policy,
    ...computeWeeklyGrade(policy, { days, track: trackDetail, weekly: weeklyDetail, today: date }), trackDetail, weeklyDetail,
    records: { [start]: { reading: { grade: dailyReading.grade, max: dailyReading.max, passed: true, detail: dailyReading }, attendance: { grade: 1, max: 1, detail: { status: 'present' } } } } };
});
const notifications = [1, 2].map(id => ({ id, title: `إشعار الاختبار ${id}`, body: 'خبر للطالب', createdAt: `${date}T12:00:00`, isRead: false }));
const nativeFetch = globalThis.fetch.bind(globalThis);
const callDirectory = { livekitConfigured: true, rooms: [
  { id: 1, name: 'مكالمة الاختبار', status: 'open', studentPresent: false, participants: [] },
  { id: 2, name: 'مكالمة فيها طالب', status: 'open', studentPresent: true, participants: [{ name: 'طالب تجريبي' }] },
] };
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!url.pathname.includes('/api/')) {
    if (url.origin !== location.origin) throw new Error('External network is disabled in this preview');
    return nativeFetch(input, init);
  }
  const path = url.pathname;
  if (path.endsWith('/calls/events')) {
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(callDirectory)}\n\n`));
      init?.signal?.addEventListener('abort', () => controller.close(), { once: true });
    } });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
  }
  await delayPreviewRankings(path);
  let data = [];
  if (path.endsWith('/calls')) data = callDirectory;
  if (/\/calls\/\d+\/token$/.test(path)) data = { serverUrl: 'wss://local-test.invalid', token: 'synthetic' };
  if (path.endsWith('/notifications')) data = notifications;
  if (path.endsWith('/notifications/read')) {
    if (new URLSearchParams(location.search).has('notificationsFail')) return new Response(JSON.stringify({ message: 'تعذر تحديث حالة القراءة.' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
    const { ids } = JSON.parse(init.body);
    notifications.filter(row => ids.includes(row.id)).forEach(row => { row.isRead = true; }); data = { ok: true };
  }
  if (path.endsWith('/quran-level')) data = { name: 'تأهيل 1', progressPercent: 44 };
  if (path.endsWith('/student-news')) data = { entries: [] };
  if (path.endsWith('/quran-tasks/execution')) {
    const payload = JSON.parse(init?.body || '{}');
    tasks.forEach((task) => { if (payload.taskIds?.includes(task.id)) task.studentStatus = payload.status; });
    data = { success: true };
  }
  if (path.endsWith('/programs')) data = { programs: [{ id: 'demo-1', title: 'إتقان التلاوة', completedAt: null }, { id: 'demo-2', title: 'تدبر القرآن', completedAt: null }] };
  if (path.endsWith('/public-settings')) data = settings;
  if (path.endsWith('/quran-today')) data = { date, plan: { id: 'preview', progressPercent: 44, projectedEndDate: shiftDateOnly(date, 80) }, tasks, todayAmounts: tasks, repeatCount: 10, listeningCount: 3 };
  if (path.endsWith('/quran-sessions')) data = { rows: tasks, weeklyGrades, points: { total: 3650, days: [date, shiftDateOnly(date, -1), shiftDateOnly(date, -2)].map((day) => ({ date: day, earned: 43, maximum: 45, pending: false, details: [{ label: 'الحضور', earned: 25 }, { label: 'تقييم الحفظ', earned: 18 }] })) } };
  if (path.endsWith('/quran-saved')) data = [{ juz: 1, label: 'الجزء الأول', progressPercent: 27, savedRanges: [range, { ...range, fromAyah: 35, toAyah: 39, fromPage: 7, toPage: 7 }] }, { juz: 30, label: 'الجزء الثلاثون', progressPercent: 100, savedRanges: [{ fromPage: 604, toPage: 604, fromSurah: 114, toSurah: 114, fromSurahName: 'الناس', toSurahName: 'الناس', fromAyah: 1, toAyah: 6 }] }];
  if (path.endsWith('/rankings/students')) data = names.map((name, index) => ({ id: index === 1 ? 'preview-student' : index, name, committeeName: 'حلقة الإتقان', points: 4200 - 550 * index, rank: index + 1 }));
  if (path.endsWith('/rankings/families')) data = ['الإتقان', 'الهدى', 'الفرقان', 'النور', 'البيان', 'الريان', 'الماهر', 'الترتيل'].map((name, index) => ({ id: index, name: `حلقة ${name}`, points: 12000 - 500 * index, rank: index + 1 }));
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
function CallCheck() {
  const [, refresh] = useState(0);
  useEffect(() => { const timer = setInterval(() => refresh(value => value + 1), 250); return () => clearInterval(timer); }, []);
  return <output className="fixed bottom-0 right-0 z-[80] bg-white p-1 text-xs" aria-label="إحصاءات اتصال الاختبار">غرف {Room.instances.length} · اتصالات {Room.instances.reduce((sum, room) => sum + room.connections, 0)} · خروج {Room.instances.reduce((sum, room) => sum + room.disconnections, 0)}</output>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><StudentHome studentId="preview-student" executionEnabled onLogout={() => location.reload()} />{new URLSearchParams(location.search).has('calls') && <CallCheck />}<Toaster /></BrowserRouter>);


/** Simulate delayed rankings only when the preview explicitly requests the scenario. */
async function delayPreviewRankings(path) {
  if (new URLSearchParams(location.search).has('slowRankings') && path.includes('/rankings/')) {
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}
