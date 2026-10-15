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
import { emptyStaffDraft, filterManagedStaff, staffDraft, staffFixedPermissions, staffPermissionOptions,
  type ManagedStaff, type StaffDraft, type StaffManagementMode } from '../domain/staffManagement';
import { useLoadedResource } from '../hooks/useLoadedResource';
import { useVerifiedMutation } from '../hooks/useVerifiedMutation';
import type { StaffManagementApi } from '../services/staffManagementApi';
import { usePalette } from '../theme';
import { ManagementEmpty, ManagementIconButton, ManagementPanel, ManagementRow, ManagementToolbar } from '../components/dashboard/ManagementPanel';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';

export function StaffManagementScreen({ api, mode, onBack }: { api: StaffManagementApi; mode: StaffManagementMode; onBack: () => void }) {
  const palette = usePalette(); const supervisors = mode === 'supervisors';
  const singular = supervisors ? 'مشرف المسار' : 'الإداري'; const plural = supervisors ? 'مشرفو المسارات' : 'الإداريون';
  const loader = useCallback((signal: AbortSignal) => api.loadStaff(mode, signal), [api, mode]);
  const resource = useLoadedResource(loader); const mutation = useVerifiedMutation(resource.reload);
  const { busy, uncertain, error: formError, notice } = mutation;
  const [search, setSearch] = useState(''); const [circleFilter, setCircleFilter] = useState('all'); const [filterOpen, setFilterOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false); const [selected, setSelected] = useState<ManagedStaff | null>(null);
  const [draft, setDraft] = useState(emptyStaffDraft); const [deleting, setDeleting] = useState<ManagedStaff | null>(null);
  const [choices, setChoices] = useState<'circles' | 'permissions' | null>(null);
  const staff = resource.value?.staff ?? []; const circles = resource.value?.circles ?? [];
  const visible = filterManagedStaff(staff, search, supervisors ? circleFilter : 'all');
  const fixed = staffFixedPermissions(mode);
  const assignable = api.canManage(mode) ? api.assignablePermissions(mode) : [];
  const permissions = staffPermissionOptions.filter(option => (mode !== 'administrators' || option.value !== 'quranEvaluation')
    && (fixed.includes(option.value) || assignable.includes(option.value) || draft.permissions.includes(option.value)));
  const blocked = busy || uncertain || resource.loading || !!resource.error;
  function change<K extends keyof StaffDraft>(key: K, value: StaffDraft[K]) {
    setDraft(current => ({ ...current, [key]: value })); mutation.reset();
  }
  function edit(row: ManagedStaff | null) {
    if (blocked || !api.canManage(mode, row ?? undefined)) return;
    setSelected(row); setDraft(row ? staffDraft(row) : emptyStaffDraft()); mutation.reset(); setChoices(null); setFormOpen(true);
  }
  function closeForm() {
    const close = () => { setFormOpen(false); setChoices(null); setDraft(emptyStaffDraft()); };
    if (uncertain) void mutation.reconcile(close); else close();
  }
  const circleNames = (ids: readonly number[]) => circles.filter(circle => ids.includes(circle.id))
    .map(circle => `${circle.name}${circle.complexName ? ` • ${circle.complexName}` : ''}`).join('، ');
  const selectedPermissionLabels = permissions.filter(option => fixed.includes(option.value) || draft.permissions.includes(option.value))
    .map(option => option.label).join('، ');
  return <ScreenLayout title={plural} onBack={onBack} loading={resource.loading} error={resource.error} onRetry={() => { void resource.reload(); }}>
    {!!notice && <AppText accessibilityLiveRegion="polite">{notice}</AppText>}
    <ManagementPanel><ManagementToolbar><View style={{ flex: 1, flexBasis: 224 }}><FormField label={`ابحث باسم ${singular} أو رقم الدخول`} hideLabel compact
      placeholder={`ابحث باسم ${singular} أو رقم الدخول`} value={search} onChangeText={setSearch} /></View>
        {supervisors && <DashboardSelect basis={160} label="اختر الحلقة" value={circles.find(circle => String(circle.id) === circleFilter)?.name || (circleFilter === 'none' ? 'بلا حلقات' : 'كل الحلقات')}
          onPress={() => setFilterOpen(true)} />}
        <ActionButton label={supervisors ? 'إضافة مشرف مسار' : 'إضافة إداري'} icon="plus" disabled={blocked || !api.canManage(mode)} onPress={() => edit(null)} />
        {uncertain && <ActionButton label="تحديث القائمة" secondary disabled={busy || resource.loading} onPress={() => {
          if (uncertain) void mutation.reconcile(() => { setFormOpen(false); setDeleting(null); setDraft(emptyStaffDraft()); }); else void resource.reload();
        }} />}
    </ManagementToolbar>
    {!resource.loading && !resource.error && <>
      {!visible.length && <ManagementEmpty>{staff.length ? 'لا توجد نتائج مطابقة للبحث.' : supervisors ? 'لا يوجد مشرفو مسارات.' : 'لا يوجد إداريون.'}</ManagementEmpty>}
      {visible.map(row => <ManagementRow key={row.id} title={row.name}
        subtitle={supervisors ? circleNames(row.committeeIds) || 'بلا حلقات' : row.role === 'manager' ? 'مدير المجمع' : row.jobTitle || 'إداري'}
        disabled={blocked || !api.canManage(mode, row)} onOpen={api.canManage(mode, row) ? () => edit(row) : undefined}
        actions={api.canManage(mode, row) ? <>
          <ManagementIconButton icon="edit" label={`تعديل ${row.name}`} disabled={blocked} onPress={() => edit(row)} />
          <ManagementIconButton icon="delete" label={`حذف ${row.name}`} disabled={blocked} onPress={() => { mutation.reset(); setDeleting(row); }} />
        </> : undefined} />)}
    </>}
    </ManagementPanel>
    <FormDialog visible={formOpen} title={`${selected ? 'تعديل' : 'إضافة'} ${singular}`} busy={busy} onClose={closeForm}
      footer={uncertain ? <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={() => { void mutation.reconcile(() => {
        setFormOpen(false); setChoices(null); setDraft(emptyStaffDraft());
      }); }} /> : <ActionButton label={`حفظ ${singular}`} loading={busy} disabled={resource.loading || !!resource.error}
        onPress={() => { void mutation.run(() => api.saveStaff(mode, draft, circles, selected ?? undefined), () => {
          setFormOpen(false); setChoices(null); setDraft(emptyStaffDraft());
        }, () => selected ? `حُفظت بيانات ${singular}.` : `أُضيف حساب ${singular}.`); }} />}>
      <View style={screenStyles.grid}>
        <View style={screenStyles.field}><FormField label={`اسم ${singular}`} value={draft.name} maxLength={180} editable={!blocked}
          onChangeText={value => change('name', value)} /></View>
        {!supervisors && <View style={screenStyles.field}><FormField label="المسمى" value={draft.jobTitle} maxLength={120} editable={!blocked}
          onChangeText={value => change('jobTitle', value)} /></View>}
        <View style={screenStyles.field}><FormField label="رقم الدخول" value={draft.loginNumber} maxLength={80} keyboardType="number-pad" editable={!blocked}
          onChangeText={value => change('loginNumber', normalizeNumericInput(value, 80))} /></View>
        <View style={screenStyles.field}><FormField label={selected ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور'} password value={draft.password}
          maxLength={256} editable={!blocked} onChangeText={value => change('password', value)}
          hint={selected ? 'اتركها فارغة للاحتفاظ بكلمة المرور. تغييرها أو تغيير رقم الدخول ينهي جلسات الحساب.' : undefined} /></View>
        <View style={screenStyles.field}><FormField label="رقم الجوال (اختياري)" value={draft.phone} keyboardType="phone-pad" editable={!blocked}
          onChangeText={value => change('phone', normalizeNumericInput(value, 15))} /></View>
        <View style={screenStyles.field}><FormField label="رقم الهوية (اختياري)" value={draft.nationalId} keyboardType="number-pad" editable={!blocked}
          onChangeText={value => change('nationalId', normalizeNumericInput(value, 10))} /></View>
      </View>
      {supervisors && <SectionCard title="الحلقات المرتبطة">
        <AppText>{circleNames(draft.committeeIds.map(Number)) || 'بلا حلقات'}</AppText>
        <ActionButton label={choices === 'circles' ? 'إخفاء خيارات الحلقات' : 'اختيار الحلقات'} secondary disabled={blocked}
          onPress={() => setChoices(choices === 'circles' ? null : 'circles')} />
        {choices === 'circles' && <View style={screenStyles.actions}>
          {!circles.length && <AppText>أضف الحلقات أولًا.</AppText>}
          {circles.map(circle => {
            const checked = draft.committeeIds.includes(String(circle.id));
            const label = `${circle.name}${circle.complexName ? ` • ${circle.complexName}` : ''}`;
            return <ActionButton key={circle.id} label={`${checked ? '✓ ' : ''}${label}`} accessibilityLabel={`${label}، ${checked ? 'محددة' : 'غير محددة'}`}
              secondary={!checked} disabled={blocked} onPress={() => change('committeeIds', checked ? draft.committeeIds.filter(id => id !== String(circle.id))
                : [...draft.committeeIds, String(circle.id)])} />;
          })}
        </View>}
      </SectionCard>}
      <SectionCard title="الصلاحيات"><AppText>{selectedPermissionLabels || 'بلا صلاحيات'}</AppText>
        <ActionButton label={choices === 'permissions' ? 'إخفاء خيارات الصلاحيات' : 'اختيار الصلاحيات'} secondary disabled={blocked}
          onPress={() => setChoices(choices === 'permissions' ? null : 'permissions')} />
        {choices === 'permissions' && <View style={screenStyles.actions}>{permissions.map(option => {
          const immutable = fixed.includes(option.value); const checked = immutable || draft.permissions.includes(option.value);
          return <ActionButton key={option.value} label={`${checked ? '✓ ' : ''}${option.label}${immutable ? ' (أساسية)' : ''}`}
            accessibilityLabel={`${option.label}، ${immutable ? 'صلاحية أساسية' : checked ? 'محددة' : 'غير محددة'}`}
            secondary={!checked} disabled={blocked || immutable || !assignable.includes(option.value)}
            onPress={() => change('permissions', checked ? draft.permissions.filter(key => key !== option.value) : [...draft.permissions, option.value])} />;
        })}</View>}
      </SectionCard>
      {!!formError && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{formError}</AppText>}
    </FormDialog>
    <ConfirmDialog visible={!!deleting} title={`حذف ${singular}`} message={`سيُحذف حساب ${deleting?.name ?? singular} وسجل حضوره. لا يمكن التراجع عن الحذف.`}
      confirmLabel={uncertain ? 'تحديث البيانات للتحقق' : `حذف ${singular}`} busy={busy} error={formError}
      onClose={() => { if (uncertain) void mutation.reconcile(() => setDeleting(null)); else setDeleting(null); }}
      onConfirm={() => {
        if (uncertain) void mutation.reconcile(() => setDeleting(null));
        else if (deleting) void mutation.run(() => api.deleteStaff(mode, deleting), () => setDeleting(null), () => `حُذف ${singular}.`);
      }} />
    <ChoiceDialog visible={filterOpen} title="اختر الحلقة" value={circleFilter} onChoose={setCircleFilter} onClose={() => setFilterOpen(false)}
      options={[{ value: 'all', label: 'كل الحلقات' }, { value: 'none', label: 'بلا حلقات' }, ...circles.map(circle => ({
        value: String(circle.id), label: `${circle.name}${circle.complexName ? ` • ${circle.complexName}` : ''}`,
      }))]} />
  </ScreenLayout>;
}
