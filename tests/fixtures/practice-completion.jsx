import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TeacherRecitationTaskList from '../../src/components/portal/TeacherRecitationTaskList';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
const task = { id: 1, planId: 1, studentId: 99, studentName: 'طالب اختبار', taskType: 'memorization',
  track: 'memorization', taskDate: '2026-09-22', fromSurah: 61, toSurah: 61, fromAyah: 1, toAyah: 4,
  fromSurahName: 'الصف', toSurahName: 'الصف', fromPage: 551, toPage: 551, expectedRepeatCount: 10, expectedListeningCount: 3 };
function Preview() {
  const [selected, setSelected] = useState(null);
  return <main className="p-3 [font-family:var(--font-ui)]">
    <TeacherRecitationTaskList tasks={[task]} taskQueue={[task]}
      students={[{ studentId: 99, studentName: 'طالب اختبار', attendanceStatus: 'present' }]}
      showAmounts teacherExecutionMode listeningEnabled onRecite={setSelected} />
    <output aria-label="اختيارات التنفيذ">{selected ? `${selected.repeatCount},${selected.listeningCount}` : ''}</output>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
