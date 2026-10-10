import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, ManagementPanel, ManagementToolbar, ManagementEmpty, ManagementList, ManagementRow } from '../layout/ManagementPanel';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from '../DashboardLoader';
import { passingApi } from '@/services/passingApi';
import { PASSING_TYPES } from '../../../../shared/passing-policy.js';
import PassingStudentDialog from './PassingStudentDialog';

const optionsFrom = (students, idKey, nameKey) => [...new Map(students.filter(student => student[idKey])
  .map(student => [String(student[idKey]), { id: String(student[idKey]), name: student[nameKey] }])).values()];

export default function PassingSection() {
  const [type, setType] = useState('branch');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [complexId, setComplexId] = useState('all');
  const [committeeId, setCommitteeId] = useState('all');
  const [studentId, setStudentId] = useState('all');
  const [selected, setSelected] = useState(null);
  const loadRevision = useRef(0);
  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoadError(''); setLoading(true);
    try {
      const rows = await passingApi.students();
      if (revision === loadRevision.current) setStudents(rows);
    } catch (error) { if (revision === loadRevision.current) setLoadError(error.message); }
    finally { if (revision === loadRevision.current) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const complexes = useMemo(() => optionsFrom(students, 'complexId', 'complexName'), [students]);
  const complexStudents = students.filter(student => complexId === 'all' || String(student.complexId) === complexId);
  const committees = optionsFrom(complexStudents, 'committeeId', 'committeeName');
  const committeeStudents = complexStudents.filter(student => committeeId === 'all' || String(student.committeeId) === committeeId);
  const visible = committeeStudents.filter(student => studentId === 'all' || String(student.id) === studentId);
  const filters = [
    { label: 'المجمع', value: complexId, options: complexes, change: value => { setComplexId(value); setCommitteeId('all'); setStudentId('all'); } },
    { label: 'الحلقة', value: committeeId, options: committees, change: value => { setCommitteeId(value); setStudentId('all'); } },
    { label: 'الطالب', value: studentId, options: committeeStudents, change: setStudentId },
  ];
  return <div dir="rtl" className="space-y-4 [font-family:var(--font-ui)]">
    <div role="group" aria-label="نوع الاجتياز" className="grid grid-cols-2 gap-2 sm:max-w-md">
      {Object.entries(PASSING_TYPES).map(([key, label]) => <Button key={key} variant={type === key ? 'default' : 'outline'} aria-pressed={type === key}
        className="min-h-11" onClick={() => { setType(key); setSelected(null); }}>{label}</Button>)}
    </div>
    <ManagementPanel>
      <ManagementToolbar className="grid grid-cols-1 items-end sm:grid-cols-3">
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
          actions={<ManagementIconButton tone="primary" aria-label={`اختبار ${student.name}`} title="اختبار" onClick={() => setSelected(student)}>
            <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
          </ManagementIconButton>} />)}</ManagementList>}
    </ManagementPanel>
    {selected && <PassingStudentDialog key={`${type}:${selected.id}`} student={selected} type={type} onClose={() => setSelected(null)} />}
  </div>;
}
