import React from 'react';
import { createRoot } from 'react-dom/client';
import MetricDetails from '../../src/components/dashboard/reports/MetricDetails';
import { buildReportMetrics } from '../../src/components/dashboard/reports/reportMetrics';
import { STUDENT_LEVELS } from '../../shared/student-levels';
import NewsEntryDialog from '../../src/components/dashboard/NewsEntryDialog';
import StudentNewsEditor from '../../src/components/dashboard/StudentNewsEditor';
import NotificationsSection from '../../src/components/dashboard/NotificationsSection';
import WhatsAppSendSection from '../../src/components/dashboard/WhatsAppSendSection';
import SettingsSection from '../../src/components/dashboard/SettingsSection';
import StudentsSection from '../../src/components/dashboard/StudentsSection';
import { BrowserRouter } from '../../src/lib/router';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const students = [{id: 1, name: 'طالب تجريبي', role: 'student', committeeId: 1, committeeName: 'حلقة الاختبار', guardianPhone: '0500000000', points: 47, loginNumber: '12345'}];
const committees = [{id: 1, name: 'حلقة الاختبار'}];
studentsApi.getStudents = async () => students;
studentsApi.getCommittees = async () => committees;
studentsApi.getSupervisors = async () => [];
studentsApi.getNotificationAudience = async () => ({people: students, committees});
studentsApi.getNotificationHistory = async () => [];
studentsApi.getWhatsAppStatus = async () => ({status: 'ready'});
studentsApi.getSettings = async () => ({});
studentsApi.getExecutionReminderStudents = async () => ({students: []});
const section = new URLSearchParams(location.search).get('section');
function Fixture() {
  if (section === 'news-editor') return <StudentNewsEditor />;
  if (section === 'news') return <NewsEntryDialog entry={{id:'test', title:'', committeeIds:[], startsAt:'', endsAt:''}} committees={committees} onClose={() => {}} onSave={value => { globalThis.savedNews = value; }} />;
  if (section === 'levels') {
    const metric = buildReportMetrics({studentLevels: STUDENT_LEVELS.map((level, index) => ({name: `طالب ${level.name}`, level, days: index + 1}))}).find(item => item.id === 'levels');
    return <MetricDetails metric={metric} onClose={() => {}} periodLabel="الفصل الحالي" />;
  }
  if (section === 'term') return <SettingsSection activeCategory="settingsTerm" canManageDeletionRequests />;
  if (section === 'students') return <StudentsSection />;
  return section === 'whatsapp' ? <WhatsAppSendSection /> : <NotificationsSection />;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><main className="p-3"><Fixture /></main></BrowserRouter>);
