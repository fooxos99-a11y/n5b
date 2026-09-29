import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from '../../src/lib/router';
import StudentHome from '../../src/components/portal/home/StudentHome';
import { Toaster } from '../../src/components/ui/toaster';
import { getBusinessDate, shiftDateOnly } from '../../shared/business-date.js';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname) || location.port !== '3003') throw new Error('Preview requires the isolated local port 3003');
document.title = 'معاينة الطالب — بيانات تجريبية';
document.documentElement.classList.add('light');
localStorage.setItem('wajeh_role', 'student');
localStorage.setItem('wajeh_student_id', 'preview-student');
const date = getBusinessDate();
const range = { fromPage: 5, toPage: 5, fromSurah: 2, toSurah: 2, fromSurahName: 'البقرة', toSurahName: 'البقرة', fromAyah: 25, toAyah: 29 };
const tasks = ['memorization', 'review', 'link'].map((taskType, index) => ({ ...range, id: index + 1, taskType, taskDate: date, sessionDate: date, studentStatus: null, teacherCompleted: null, mistakeCount: index, warningCount: 0 }));
const names = ['عبدالله محمد', 'خالد سليمان', 'أحمد ناصر', 'عمر عبدالرحمن', 'أنس إبراهيم', 'محمد عبدالله', 'يوسف فهد', 'سلمان سعد'];
const settings = { learningPathsEnabled: true, hasStudentQuranExecution: true, pointsSystemEnabled: true, storeEnabled: true, studentRankingsVisible: true, familyRankingsVisible: true, rankingPointsVisible: true };
const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url, location.href);
  if (!url.pathname.includes('/api/')) {
    if (url.origin !== location.origin) throw new Error('External network is disabled in this preview');
    return nativeFetch(input, init);
  }
  const path = url.pathname;
  await delayPreviewRankings(path);
  let data = [];
  if (path.endsWith('/quran-tasks/execution')) {
    const payload = JSON.parse(init?.body || '{}');
    tasks.forEach((task) => { if (payload.taskIds?.includes(task.id)) task.studentStatus = payload.status; });
    data = { success: true };
  }
  if (path.endsWith('/programs')) data = { programs: [{ id: 'demo-1', title: 'إتقان التلاوة', completedAt: null }, { id: 'demo-2', title: 'تدبر القرآن', completedAt: null }] };
  if (path.endsWith('/public-settings')) data = settings;
  if (path.endsWith('/quran-today')) data = { date, plan: { id: 'preview', progressPercent: 44 }, tasks, todayAmounts: tasks, repeatCount: 10, listeningCount: 3 };
  if (path.endsWith('/quran-sessions')) data = { rows: tasks, points: { total: 3650, days: [date, shiftDateOnly(date, -1), shiftDateOnly(date, -2)].map((day) => ({ date: day, earned: 43, maximum: 45, pending: false, details: [{ label: 'الحضور', earned: 25 }, { label: 'تقييم الحفظ', earned: 18 }] })) } };
  if (path.endsWith('/quran-saved')) data = [{ juz: 1, label: 'الجزء الأول', progressPercent: 27, savedRanges: [range, { ...range, fromAyah: 35, toAyah: 39, fromPage: 7, toPage: 7 }] }, { juz: 30, label: 'الجزء الثلاثون', progressPercent: 100, savedRanges: [{ fromPage: 604, toPage: 604, fromSurah: 114, toSurah: 114, fromSurahName: 'الناس', toSurahName: 'الناس', fromAyah: 1, toAyah: 6 }] }];
  if (path.endsWith('/rankings/students')) data = names.map((name, index) => ({ id: index === 1 ? 'preview-student' : index, name, committeeName: 'حلقة الإتقان', points: 4200 - 550 * index, rank: index + 1 }));
  if (path.endsWith('/rankings/families')) data = ['الإتقان', 'الهدى', 'الفرقان', 'النور', 'البيان', 'الريان', 'الماهر', 'الترتيل'].map((name, index) => ({ id: index, name: `حلقة ${name}`, points: 12000 - 500 * index, rank: index + 1 }));
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
createRoot(document.getElementById('root')).render(<BrowserRouter><StudentHome studentId="preview-student" executionEnabled onLogout={() => location.reload()} /><Toaster /></BrowserRouter>);


/** Simulate delayed rankings only when the preview explicitly requests the scenario. */
async function delayPreviewRankings(path) {
  if (new URLSearchParams(location.search).has('slowRankings') && path.includes('/rankings/')) {
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}
