import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { normalizeNumericInput } from '../../../src/lib/numericInput.js';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { ScreenLayout, SectionCard, screenStyles } from '../components/ScreenLayout';
import { emptyStudentDraft, filterManagedStudents, studentDraft, type ManagedStudent, type StudentDraft } from '../domain/management';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import type { ManagementApi } from '../services/managementApi';
import { usePalette } from '../theme';
import { ManagementEmpty, ManagementIconButton, ManagementPanel, ManagementRow, ManagementToolbar } from '../components/dashboard/ManagementPanel';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';

export function StudentManagementScreen({ api, onBack }: { api: ManagementApi; onBack: () => void }) {
  const palette = usePalette();
  const loader = useCallback((signal: AbortSignal) => api.loadStudents(signal), [api]);
  const resource = useLoadedResource(loader);
  const [search, setSearch] = useState(''); const [circleFilter, setCircleFilter] = useState('all');
  const [choice, setChoice] = useState<'circleFilter' | 'circle' | 'complex' | 'move' | null>(null);
  const [formOpen, setFormOpen] = useState(false); const [selected, setSelected] = useState<ManagedStudent | null>(null);
  const [draft, setDraft] = useState(emptyStudentDraft);
  const [deleting, setDeleting] = useState<ManagedStudent | null>(null); const [moving, setMoving] = useState<ManagedStudent | null>(null);
  const [moveCircle, setMoveCircle] = useState('');
  const mutation = useVerifiedMutation(resource.reload); const { busy, error: formError, notice, uncertain } = mutation;
  const circles = resource.value?.circles ?? []; const students = resource.value?.students ?? [];
  const complexes = [...new Map(circles.filter(circle => circle.complexId !== null)
    .map(circle => [String(circle.complexId), { value: String(circle.complexId), label: circle.complexName || `مجمع ${circle.complexId}` }])).values()];
  const visible = filterManagedStudents(students, search, circleFilter, 'all');
  function change<K extends keyof StudentDraft>(key: K, value: StudentDraft[K]) { setDraft(current => ({ ...current, [key]: value })); mutation.reset(); }
  function edit(student: ManagedStudent | null) {
    setSelected(student); setDraft(student ? studentDraft(student) : emptyStudentDraft()); mutation.reset(); setFormOpen(true);
  }
  async function mutate(work: () => Promise<unknown>, close: () => void, message: string) {
    await mutation.run(work, close, () => message);
  }
  const circleOptions = circles.filter(circle => choice !== 'circle' || circle.complexId === Number(draft.complexId))
    .map(circle => ({ value: String(circle.id), label: `${circle.name}${circle.complexName ? ` • ${circle.complexName}` : ''}` }));
  const options = choice === 'complex' ? complexes : choice === 'circleFilter' ? [{ value: 'all', label: 'كل الحلقات' }, { value: 'none', label: 'بلا حلقة' }, ...circleOptions] : circleOptions;
  const chosen = choice === 'complex' ? draft.complexId : choice === 'circle' ? draft.committeeId
    : choice === 'circleFilter' ? circleFilter : moveCircle;
  function choose(value: string) {
    if (choice === 'complex') { setDraft(current => ({ ...current, complexId: value, committeeId: '' })); }
    else if (choice === 'circle') change('committeeId', value);
    else if (choice === 'circleFilter') setCircleFilter(value);
    else setMoveCircle(value);
  }
  return <ScreenLayout title="الطلاب" onBack={onBack} loading={resource.loading} error={resource.error} onRetry={() => { void resource.reload(); }}>
    {!!notice && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
    <ManagementPanel><ManagementToolbar><View style={{ flex: 1, flexBasis: 224 }}><FormField label="ابحث باسم الطالب" hideLabel compact placeholder="ابحث باسم الطالب" value={search} onChangeText={setSearch} /></View>
      <DashboardSelect basis={160} label="اختر الحلقة" value={circles.find(circle => String(circle.id) === circleFilter)?.name || (circleFilter === 'none' ? 'بلا حلقة' : 'كل الحلقات')}
        onPress={() => setChoice('circleFilter')} /><ActionButton label="إضافة طالب" icon="plus" disabled={resource.loading || !!resource.error}
        onPress={() => edit(null)} /></ManagementToolbar>
    {!resource.loading && !resource.error && <>
      {!visible.length && <ManagementEmpty>{students.length ? 'لا يوجد طلاب مطابقون للبحث.' : 'لا يوجد طلاب.'}</ManagementEmpty>}
      {visible.map(student => <ManagementRow key={student.id} title={student.name} subtitle={student.committeeName || 'بدون حلقة'}
        disabled={busy} onOpen={() => edit(student)} actions={<>
          <ManagementIconButton icon="edit" label={`تعديل ${student.name}`} disabled={busy} onPress={() => edit(student)} />
          <ManagementIconButton icon="move" label={`نقل ${student.name}`} disabled={busy} onPress={() => { setMoving(student); setMoveCircle(String(student.committeeId ?? '')); mutation.reset(); }} />
          <ManagementIconButton icon="delete" label={`حذف ${student.name}`} disabled={busy} onPress={() => { setDeleting(student); mutation.reset(); }} />
        </>} />)}
    </>}
    </ManagementPanel>
    <FormDialog visible={formOpen} title={selected ? 'تعديل الطالب' : 'إضافة طالب'} busy={busy} onClose={() => {
      if (uncertain) void mutation.reconcile(() => setFormOpen(false)); else setFormOpen(false);
    }} footer={uncertain ? <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={() => { void mutation.reconcile(() => setFormOpen(false)); }} />
      : <ActionButton label="حفظ الطالب" loading={busy} onPress={() => { void mutate(() => api.saveStudent(draft, circles, selected ?? undefined),
        () => { setFormOpen(false); setDraft(emptyStudentDraft()); }, selected ? 'حُفظت بيانات الطالب. يحتاج إلى الدخول مجددًا.' : 'أُضيف الطالب.'); }} />}>
      <View style={screenStyles.grid}>
        <View style={screenStyles.field}><FormField label="اسم الطالب" value={draft.name} maxLength={180} editable={!busy} onChangeText={value => change('name', value)} /></View>
        <View style={screenStyles.field}><FormField label="رقم الدخول" value={draft.loginNumber} maxLength={80} keyboardType="number-pad" editable={!busy}
          onChangeText={value => change('loginNumber', normalizeNumericInput(value, 80))} /></View>
        <View style={screenStyles.field}><FormField label="كلمة المرور" password value={draft.password} maxLength={256} editable={!busy} onChangeText={value => change('password', value)}
          hint={selected ? 'كلمة المرور مطلوبة عند التعديل. تنتهي جلسات الطالب الحالية بعد الحفظ.' : undefined} /></View>
        <View style={screenStyles.field}><FormField label="رقم الهوية (اختياري)" value={draft.nationalId} keyboardType="number-pad" editable={!busy}
          onChangeText={value => change('nationalId', normalizeNumericInput(value, 10))} /></View>
        <View style={screenStyles.field}><FormField label="جوال ولي الأمر (اختياري)" value={draft.guardianPhone} keyboardType="phone-pad" editable={!busy}
          onChangeText={value => change('guardianPhone', normalizeNumericInput(value, 15))} /></View>
        <View style={screenStyles.field}><FormField label="جوال الطالب (اختياري)" value={draft.phone} keyboardType="phone-pad" editable={!busy}
          onChangeText={value => change('phone', normalizeNumericInput(value, 15))} /></View>
      </View>
      <ActionButton secondary disabled={busy} label={`المجمع: ${complexes.find(complex => complex.value === draft.complexId)?.label || 'اختر المجمع'}`} onPress={() => setChoice('complex')} />
      <ActionButton secondary disabled={busy || !draft.complexId} label={`الحلقة: ${circles.find(circle => String(circle.id) === draft.committeeId)?.name || 'اختر الحلقة'}`} onPress={() => setChoice('circle')} />
      {selected && <SectionCard title={`الرصيد الحالي: ${selected.points} درجة`}>
        <View style={screenStyles.actions}><ActionButton label="إضافة درجات" secondary={draft.gradeAdjustmentType !== 'increase'} disabled={busy} onPress={() => change('gradeAdjustmentType', 'increase')} />
          <ActionButton label="خصم درجات" secondary={draft.gradeAdjustmentType !== 'deduction'} disabled={busy} onPress={() => change('gradeAdjustmentType', 'deduction')} /></View>
        <FormField label="عدد الدرجات" value={draft.gradeAdjustmentAmount} keyboardType="decimal-pad" editable={!busy} onChangeText={value => change('gradeAdjustmentAmount', value)} />
        <FormField label="سبب تعديل الرصيد" value={draft.gradeAdjustmentReason} maxLength={500} editable={!busy} onChangeText={value => change('gradeAdjustmentReason', value)} />
      </SectionCard>}
      {!!formError && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{formError}</AppText>}
    </FormDialog>
    <FormDialog visible={!!moving} title={`نقل ${moving?.name ?? 'الطالب'}`} busy={busy} onClose={() => {
      if (uncertain) void mutation.reconcile(() => setMoving(null)); else setMoving(null);
    }} footer={uncertain ? <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={() => { void mutation.reconcile(() => setMoving(null)); }} />
      : <ActionButton label="نقل الطالب" loading={busy} disabled={!moveCircle || moveCircle === String(moving?.committeeId)} onPress={() => {
        if (moving) void mutate(() => api.moveStudent(moving.id, Number(moveCircle), circles), () => setMoving(null), 'نُقل الطالب إلى الحلقة المختارة.');
      }} />}>
      <ActionButton label={circles.find(circle => String(circle.id) === moveCircle)?.name || 'اختر الحلقة'} secondary disabled={busy} onPress={() => setChoice('move')} />
      {!!formError && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{formError}</AppText>}
    </FormDialog>
    <ConfirmDialog visible={!!deleting} title="حذف الطالب" message={`سيُحذف حساب ${deleting?.name ?? 'الطالب'} وسجلاته المرتبطة. لا يمكن التراجع عن الحذف.`}
      confirmLabel={uncertain ? 'تحديث البيانات للتحقق' : 'حذف الطالب'} busy={busy} error={formError} onClose={() => {
        if (uncertain) void mutation.reconcile(() => setDeleting(null)); else setDeleting(null);
      }} onConfirm={() => {
        if (uncertain) void mutation.reconcile(() => setDeleting(null));
        else if (deleting) void mutate(() => api.deleteStudent(deleting.id), () => setDeleting(null), 'حُذف الطالب.');
      }} />
    <ChoiceDialog visible={!!choice} title={choice === 'complex' ? 'اختر المجمع' : 'اختر الحلقة'}
      options={options} value={chosen} onChoose={choose} onClose={() => setChoice(null)} />
  </ScreenLayout>;
}
