import React from 'react';
import { createRoot } from 'react-dom/client';
import TeacherPreviousSessionsPanel from '../../src/components/portal/TeacherPreviousSessionsPanel';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
studentsApi.getReportStudents = async () => [{ id: 101, name: 'طالب تجريبي أول' }, { id: 102, name: 'طالب تجريبي ثان' }];
studentsApi.getStudentRecitationHistory = async () => ({ rows: [] });
createRoot(document.getElementById('root')).render(<main className="p-3"><TeacherPreviousSessionsPanel /></main>);
