import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { filterPassingStudents, passingTypes, type PassingStudent, type PassingType } from '../domain/passingManagement';
import type { PassingManagementApi } from '../services/passingManagementApi';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { ActionButton } from '../components/ActionButton';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { ScreenLayout, screenStyles } from '../components/ScreenLayout';
import { ManagementEmpty, ManagementIconButton, ManagementPanel, ManagementRow, ManagementToolbar } from '../components/dashboard/ManagementPanel';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';
import { PassingStudentPartsDialog } from '../components/passing/PassingStudentPartsDialog';

export function PassingManagementScreen({ api, onBack }: { api: PassingManagementApi; onBack: () => void }) {
  const loader = useCallback((signal: AbortSignal) => api.students(signal), [api]); const resource = useLoadedResource(loader);
  const [type, setType] = useState<PassingType>('branch'); const [complex, setComplex] = useState('all'); const [committee, setCommittee] = useState('all');
  const [filter, setFilter] = useState<'complex' | 'committee' | null>(null); const [student, setStudent] = useState<PassingStudent | null>(null);
  const students = resource.value ?? []; const complexStudents = students.filter(row => complex === 'all' || String(row.complexId) === complex);
  const complexes = [...new Map(students.filter(row => row.complexId !== null).map(row => [String(row.complexId), { value: String(row.complexId), label: row.complexName }])).values()];
  const committees = [...new Map(complexStudents.filter(row => row.committeeId !== null).map(row => [String(row.committeeId), { value: String(row.committeeId), label: row.committeeName }])).values()];
  const rows = filterPassingStudents(students, '', complex, committee); const blocked = resource.loading || !!resource.error;
  return <ScreenLayout title="الاجتياز" onBack={onBack} loading={resource.loading} error={resource.error} onRetry={() => { void resource.reload(); }}>
    <View style={[screenStyles.actions, { maxWidth: 448 }]}>
      {(['branch', 'hafiz'] as const).map(value => <ActionButton key={value} label={passingTypes[value]} secondary={type !== value} disabled={blocked}
        onPress={() => { setStudent(null); setType(value); }} />)}
    </View>
    <ManagementPanel><ManagementToolbar>
      <DashboardSelect label="المجمع" value={complexes.find(row => row.value === complex)?.label || 'كل المجمعات'} disabled={blocked} onPress={() => setFilter('complex')} />
      <DashboardSelect label="الحلقة" value={committees.find(row => row.value === committee)?.label || 'كل الحلقات'} disabled={blocked} onPress={() => setFilter('committee')} />
    </ManagementToolbar>
    {!blocked && (rows.length ? rows.map(row => <ManagementRow key={row.id} title={row.name}
      subtitle={[row.complexName, row.committeeName || 'بدون حلقة'].filter(Boolean).join('، ')}
      actions={<ManagementIconButton icon="quranPassing" label={`اختبار ${row.name}`} onPress={() => setStudent(row)} />} />)
      : <ManagementEmpty>لا يوجد طلاب مطابقون.</ManagementEmpty>)}
    </ManagementPanel>
    <ChoiceDialog visible={!!filter} title={filter === 'complex' ? 'اختر المجمع' : 'اختر الحلقة'} value={filter === 'complex' ? complex : committee}
      options={[{ value: 'all', label: filter === 'complex' ? 'كل المجمعات' : 'كل الحلقات' }, ...(filter === 'complex' ? complexes : committees)]}
      onChoose={value => { if (filter === 'complex') { setComplex(value); setCommittee('all'); } else setCommittee(value); }} onClose={() => setFilter(null)} />
    {!!student && <PassingStudentPartsDialog key={`${type}:${student.id}`} api={api} student={student} type={type} onClose={() => setStudent(null)} />}
  </ScreenLayout>;
}
