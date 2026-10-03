import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import FamiliesSection from '../../src/components/dashboard/FamiliesSection';
import UsersSection from '../../src/components/dashboard/UsersSection';
import WhatsAppSendSection from '../../src/components/dashboard/WhatsAppSendSection';
import { ManagementPanel, ManagementTabs } from '../../src/components/dashboard/layout/ManagementPanel';
import { Toaster } from '../../src/components/ui/toaster';
import { studentsApi } from '../../src/services/studentsApi';
import { complexesApi } from '../../src/services/complexesApi';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
let nextId = 100;
const complexes = [{ id: 1, name: 'مجمع الاختبار الأول', committeesCount: 1 }, { id: 2, name: 'مجمع الاختبار الثاني', committeesCount: 1 }];
const circles = [{ id: 7, name: 'حلقة الأولى', complexId: 1, complexName: complexes[0].name }, { id: 8, name: 'حلقة الثانية', complexId: 2, complexName: complexes[1].name }];
const students = [{ id: 10, name: 'طالب اختبار', loginNumber: '12345', phone: '0500000001', guardianPhone: '0500000002', committeeId: 7, complexId: 1, committeeName: 'حلقة الأولى' }];
const staff = [{ id: 11, name: 'معلم اختبار', loginNumber: '23456', committeeIds: ['7'], phone: '' }];
const admins = [{ id: 12, name: 'إداري اختبار', loginNumber: '34567', role: 'admin', permissions: ['grades', 'students'] }];
const save = rows => async (id, payload) => {
  if (payload === undefined) { payload = id; rows.push({ id: nextId++, ...payload }); }
  else Object.assign(rows.find(row => row.id === id), payload);
  return { ok: true };
};
Object.assign(complexesApi, { list: async () => [...complexes], create: save(complexes), update: save(complexes) });
Object.assign(studentsApi, {
  getCommittees: async () => [...circles], getFamilies: async () => [...circles], getFamilyStudents: async () => [...students],
  createFamily: save(circles), updateFamily: save(circles),
  getStudents: async () => [...students], createStudent: save(students), updateStudent: save(students),
  getSupervisors: async () => [...staff], createSupervisor: save(staff), updateSupervisor: save(staff),
  getAdministrators: async () => [...admins], createAdministrator: save(admins), updateAdministrator: save(admins),
  getWhatsAppStatus: async () => ({ ready: false, status: 'error', message: 'خدمة خارجية غير مستخدمة في الاختبار' }),
  sendWhatsAppMessages: async () => { throw new Error('لا إرسال خارجي في الاختبار'); },
});

function Fixture() {
  const [tab, setTab] = useState('families');
  return <main className="mx-auto max-w-5xl p-3 sm:p-6" dir="rtl">
    <ManagementPanel><ManagementTabs label="فحص المرحلة الأولى" value={tab} onChange={setTab} items={[
      { value: 'families', label: 'المجمعات والحلقات' }, { value: 'users', label: 'المستخدمون' }, { value: 'whatsapp', label: 'واتساب' },
    ]} /></ManagementPanel>
    <div className="mt-4">{tab === 'families' ? <FamiliesSection /> : tab === 'users' ? <UsersSection tabs={[{ key: 'students', label: 'الطلاب' }, { key: 'supervisors', label: 'المعلمون' }, { key: 'administrators', label: 'الإداريون' }]} /> : <WhatsAppSendSection />}</div>
    <Toaster />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
