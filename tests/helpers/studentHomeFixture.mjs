import process from 'node:process';
import { URL } from 'node:url';

export function localPortalTestUrl() {
  const base = process.env.PORTAL_TEST_URL || 'http://127.0.0.1:3000';
  if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Local test server required');
  return base;
}

export function createStudentHomeFixture() {
  const date = '2026-09-08';
  const range = { fromPage: 2, toPage: 2, fromSurah: 2, toSurah: 2, fromSurahName: 'البقرة', toSurahName: 'البقرة', fromAyah: 1, toAyah: 3 };
  const tasks = ['memorization', 'review', 'link'].map((taskType, i) => ({ ...range, id: i + 1, taskType, taskDate: date, sessionDate: date, studentStatus: i === 0 ? 'done' : null, teacherCompleted: i === 0, mistakeCount: i, warningCount: 0 }));
  return { date, range, tasks };
}

export async function initializeStudentPage(page, date) {
  await page.clock.install({ time: new Date(`${date}T12:00:00Z`) });
  await page.addInitScript(() => {
    globalThis.localStorage.setItem('wajeh_role', 'student');
    globalThis.localStorage.setItem('wajeh_student_id', '991');
    globalThis.localStorage.setItem('wajeh_name', 'طالب الاختبار');
    globalThis.localStorage.setItem('nukhab_web_session', '1');
    globalThis.localStorage.setItem('wajeh_dashboard_permissions', '[]');
    globalThis.localStorage.setItem('theme', 'light');
  });
}

export function studentHomeResponse(path, { date, range, tasks, savedFailure, body = [] }) {
  if (path.endsWith('/student-news')) body = { entries: [] };
  if (path.endsWith('/public-settings')) body = { hasStudentQuranExecution: true, pointsSystemEnabled: true, storeEnabled: true, studentRankingsVisible: true, familyRankingsVisible: true, rankingPointsVisible: true };
  if (path.endsWith('/quran-today')) body = { date, plan: { id: 1, progressPercent: 44 }, todayAmounts: tasks, tasks, repeatCount: 10, listeningCount: 3 };
  if (path.endsWith('/quran-sessions')) body = { rows: tasks, points: { total: 1234, days: [{ date, earned: 43, maximum: 45, pending: false, details: [{ label: 'الحضور', earned: 25 }, { label: 'تقييم الحفظ', earned: 18 }] }] } };
  if (path.endsWith('/quran-saved')) {
    if (savedFailure) return { status: 500, json: { message: 'تعذر تحميل المحفوظ.' } };
    body = Array.from({ length: 30 }, (_, i) => ({ juz: i + 1, label: `الجزء ${i + 1}`, progressPercent: i === 29 ? 0 : 27, savedRanges: i === 29 ? [] : [range, { ...range, fromAyah: 5, toAyah: 5 }] }));
  }
  if (path.includes('/rankings/students')) body = Array.from({ length: 8 }, (_, i) => ({ id: 990 + i, name: ['عبدالله محمد عبدالرحمن السليمان', 'طالب الاختبار', 'خالد سليمان'][i % 3], committeeName: 'حلقة الإتقان', rank: i + 1, points: 1800 - 50 * i }));
  if (path.includes('/rankings/families')) body = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `حلقة الإتقان ${i + 1}`, rank: i + 1, points: 12000 - 500 * i }));
  if (path.includes('/rankings/complexes')) body = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `مجمع الإتقان ${i + 1}`, rank: i + 1, points: 20000 - 500 * i }));
  return { json: body };
}
