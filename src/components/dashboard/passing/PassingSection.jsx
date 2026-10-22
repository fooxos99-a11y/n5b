import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, ManagementPanel, ManagementToolbar, ManagementEmpty, ManagementList, ManagementRow } from '../layout/ManagementPanel';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from '../DashboardLoader';
import { passingApi } from '@/services/passingApi';
import { PASSING_TYPES } from '../../../../shared/passing-policy.js';
import PassingStudentDialog from './PassingStudentDialog';
import PassingStudentReport from './PassingStudentReport';
import { useSearch } from 'wouter';

const optionsFrom = (students, idKey, nameKey) => [...new Map(students.filter(student => student[idKey])
  .map(student => [String(student[idKey]), { id: String(student[idKey]), name: student[nameKey] }])).values()];

export default function PassingSection({ api = passingApi }) {
  const search = useSearch();
  const target = useMemo(() => new URLSearchParams(search), [search]);
  const [type, setType] = useState('branch');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [complexId, setComplexId] = useState('all');
  const [committeeId, setCommitteeId] = useState('all');
  const [selected, setSelected] = useState(null);
  const [reportStudent, setReportStudent] = useState(null);
  const loadRevision = useRef(0);
  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoadError(''); setLoading(true);
    try {
      const rows = await api.students();
      if (revision === loadRevision.current) setStudents(rows);
    } catch (error) { if (revision === loadRevision.current) setLoadError(error.message); }
    finally { if (revision === loadRevision.current) setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const student = students.find(row => String(row.id) === target.get('studentId'));
    if (!student || !['branch', 'hafiz'].includes(target.get('type'))) return;
    setType(target.get('type')); setSelected({ ...student, initialReportJuz: Number(target.get('juz')) });
  }, [students, target]);
  const complexes = useMemo(() => optionsFrom(students, 'complexId', 'complexName'), [students]);
  const complexStudents = students.filter(student => complexId === 'all' || String(student.complexId) === complexId);
  const committees = optionsFrom(complexStudents, 'committeeId', 'committeeName');
  const visible = complexStudents.filter(student => committeeId === 'all' || String(student.committeeId) === committeeId);
  const filters = [
    { label: 'المجمع', value: complexId, options: complexes, change: value => { setComplexId(value); setCommitteeId('all'); } },
    { label: 'الحلقة', value: committeeId, options: committees, change: setCommitteeId },
  ];
  return <div dir="rtl" className="space-y-4 [font-family:var(--font-ui)]">
    <div role="group" aria-label="نوع الاجتياز" className="grid grid-cols-2 gap-2 sm:max-w-md">
      {Object.entries(PASSING_TYPES).map(([key, label]) => <Button key={key} variant={type === key ? 'default' : 'outline'} aria-pressed={type === key}
        className="min-h-11" onClick={() => { setType(key); setSelected(null); }}>{label}</Button>)}
    </div>
    <ManagementPanel>
      <ManagementToolbar className="grid grid-cols-2 items-end">
        {filters.map(filter => <FormField key={filter.label} label={filter.label}>
          <Select value={filter.value} onValueChange={filter.change} disabled={loading || Boolean(loadError)}>
            <SelectTrigger aria-label={filter.label} className="min-h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">الكل</SelectItem>{filter.options.map(option =>
              <SelectItem key={option.id} value={String(option.id)}>{option.name}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>)}
      </ManagementToolbar>
      {loading ? <DashboardLoader /> : loadError ? <ErrorState message={loadError} onRetry={load} /> : !visible.length ? <ManagementEmpty>لا يوجد طلاب.</ManagementEmpty>
        : <ManagementList label="طلاب الاجتياز">{visible.map(student => <ManagementRow key={student.id} title={student.name}
          subtitle={[student.complexName, student.committeeName || 'بدون حلقة'].filter(Boolean).join('، ')}
          actions={<><ManagementIconButton tone="primary" aria-label={`تقرير ${student.name}`} title="تقرير الاختبارات" onClick={() => setReportStudent(student)}>
            <FileText className="h-5 w-5" aria-hidden="true" />
          </ManagementIconButton><ManagementIconButton tone="primary" aria-label={`اختبار ${student.name}`} title="اختبار" onClick={() => setSelected(student)}>
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </ManagementIconButton></>} />)}</ManagementList>}
    </ManagementPanel>
    {selected && <PassingStudentDialog key={`${type}:${selected.id}`} api={api} student={selected} type={type}
      initialReportJuz={selected.initialReportJuz || 0} onClose={() => setSelected(null)} />}
    {reportStudent && <PassingStudentReport key={`${type}:${reportStudent.id}`} initialType={type} api={api} student={reportStudent} onClose={() => setReportStudent(null)} />}
  </div>;
}
