import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import WeeklySessionSection from '../../src/components/dashboard/grades/WeeklySessionSection';
import TrackSessionSection from '../../src/components/dashboard/grades/TrackSessionSection';
import GradingSettingsPanel from '../../src/components/dashboard/GradingSettingsPanel';
import NotificationSettings from '../../src/components/dashboard/NotificationSettings';
import { RankingPanels, TeachersPanel } from '../../src/components/dashboard/reports/RankingPanels';
import StudentPlansSection from '../../src/components/dashboard/StudentPlansSection';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
function Fixture() {
  const [settings, setSettings] = useState({memorizationExecutionSource: 'student', automaticExecutionMessageEnabled: true});
  const section = new URLSearchParams(location.search).get('section');
  if (section === 'weekly') return <WeeklySessionSection />;
  if (section === 'track') return <TrackSessionSection />;
  if (section === 'plans') return <StudentPlansSection />;
  if (section === 'templates') return <NotificationSettings settings={settings} setSettings={setSettings} />;
  if (section.startsWith('settings-')) return <GradingSettingsPanel section={section.slice(9)} />;
  return <div className="space-y-4"><RankingPanels bestStudents={[{id:1, name:'طالب الاختبار', grade:40, percentage:80}]} bestCommittees={[{id:1, name:'حلقة الاختبار', studentsCount:10, grade:800, percentage:80}]} />
    <TeachersPanel teachers={[{id:1, name:'معلم الاختبار', committees:'حلقة الاختبار', attendance:{attended:4, expected:5, late:1, absent:1, percentage:80}, achievement:{grade:240, max:300, percentage:80}}]} />
  </div>;
}
createRoot(document.getElementById('root')).render(<main className="p-3 [font-family:var(--font-ui)]"><Fixture /></main>);
