import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuranExecutionDialog from '../../src/components/portal/QuranExecutionDialog';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';

const position = (page) => ({ page, surah: 2, ayah: page, surahName: 'البقرة' });
let date = '2026-09-06';
let planId = 21;
let done = false;
let actualPage = 24;
globalThis.executionFixture = { writes: [] };
studentsApi.getStudentQuranToday = async () => ({
  date, plan: { id: planId, dailyPages: 3, startSurah: 2, endSurah: 2, startAyah: 11, endAyah: 49 },
  executionAyahs: Array.from({ length: 11 }, (_, index) => position(22 + index)),
  executionLimits: { memorization: position(32) },
  studentTaskAmountEditable: true, allowQuranCompensation: true, allowQuranExtra: true,
  tasks: [22, 23, 24].map((page) => ({ id: page, taskType: 'memorization', fromPage: page, toPage: page,
    fromSurah: 2, toSurah: 2, fromAyah: page, toAyah: page,
    normalEnd: position(24), scheduledEnd: position(31), studentStatus: done ? 'done' : 'pending',
    actualToPage: done ? actualPage : null, actualToSurah: done ? 2 : null, actualToAyah: done ? actualPage : null,
    executionState: done ? 'extra' : null,
  })),
});
studentsApi.updateStudentQuranTasksExecution = async (studentId, body) => {
  globalThis.executionFixture.writes.push({ studentId, ...body });
  done = body.status === 'done'; actualPage = body.actualEnd?.page || 24;
};
function Fixture() {
  const [studentId, setStudentId] = useState(10);
  const [open, setOpen] = useState(true);
  globalThis.executionFixture.student = (id) => { done = false; setStudentId(id); };
  globalThis.executionFixture.context = (nextDate, nextPlan) => { date = nextDate; planId = nextPlan; setOpen(false); };
  globalThis.executionFixture.reopen = () => setOpen(true);
  return <QuranExecutionDialog studentId={studentId} open={open} onOpenChange={setOpen} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
