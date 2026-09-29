import { History } from 'lucide-react';
import React, { Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DashboardShell from '../../src/components/dashboard/DashboardShell';
import DashboardHeaderFilters from '../../src/components/dashboard/DashboardHeaderFilters';
import DashboardDateRange from '../../src/components/dashboard/DashboardDateRange';
import TeacherSessionCard from '../../src/components/portal/TeacherSessionCard';
import DashboardLoader from '../../src/components/dashboard/DashboardLoader';
import { Button } from '../../src/components/ui/button';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const pending = new Promise(() => {});
function Pending() { throw pending; }
function Preview() {
 const [loading, setLoading] = useState(false);
 const [from, setFrom] = useState('2026-09-01');
 const [to, setTo] = useState('2026-09-09');
 return <DashboardShell sections={[{ key: 'history', icon: History, label: 'جلسات التسميع السابقة' }]} activeSection="history" headerContent={<Button onClick={() => setLoading(!loading)}>تصدير</Button>}>
   <DashboardHeaderFilters><DashboardDateRange from={from} to={to} onFromChange={setFrom} onToChange={setTo} /></DashboardHeaderFilters>
   <Suspense fallback={<DashboardLoader className="min-h-[420px]" />}>
   {loading ? <Pending /> : <TeacherSessionCard studentName="طالب تجريبي" day={{ date: '2026-09-09', tasks: [
     { id: 1, taskType: 'memorization', teacherCompleted: true, fromSurahName: 'المجادلة', toSurahName: 'المجادلة', fromAyah: 1, toAyah: 8 },
     { id: 2, taskType: 'review', teacherCompleted: false },
     { id: 3, taskType: 'link', teacherCompleted: true, mistakeCount: 2 },
     { id: 4, taskType: 'memorization', track: 'mastery', teacherCompleted: false },
   ] }} />}
   </Suspense>
 </DashboardShell>;
}
createRoot(document.getElementById('root')).render(<Preview />);
