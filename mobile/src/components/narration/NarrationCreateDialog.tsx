import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { ChoiceDialog } from '../ChoiceDialog';
import { FormDialog } from '../FormDialog';
import { FormField } from '../FormField';
import { HijriDatePicker } from '../HijriDatePicker';
import { screenStyles } from '../ScreenLayout';
import { NarrationRangeEditor } from './NarrationRangeEditor';
import { filterNarrationPupils, narrationNoParticipants, narrationRangeLabel, normalizeNarrationDraft, scopedNarrationPupils,
  type NarrationDraft, type NarrationPayload, type NarrationPreview, type NarrationRange } from '../../domain/narrationManagement';
import type { ManagedCircle } from '../../domain/management';
import type { NarrationManagementApi } from '../../services/narrationManagementApi';
import { useLoadedResource } from '../../hooks/useLoadedResource';

export function NarrationCreateDialog({ api, circles, draft, onChange, busy, blocked, error, needsRefresh, onRefresh, onCreate, onClose }: {
  api: NarrationManagementApi; circles: readonly ManagedCircle[]; draft: NarrationDraft; onChange: (draft: NarrationDraft) => void;
  busy: boolean; blocked: boolean; error: string; needsRefresh: boolean; onRefresh: () => void;
  onCreate: (payload: NarrationPayload, preview: NarrationPreview) => void; onClose: () => void;
}) {
  const loader = useCallback((signal: AbortSignal) => api.loadPreparation(signal), [api]); const resource = useLoadedResource(loader);
  const [choice, setChoice] = useState<'complex' | 'circles' | null>(null); const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]); const [editor, setEditor] = useState<{ ids: number[]; ranges: NarrationRange[] } | null>(null);
  const [review, setReview] = useState<{ payload: NarrationPayload; preview: NarrationPreview } | null>(null);
  const [previewing, setPreviewing] = useState(false); const [validation, setValidation] = useState(''); const locked = useRef(false);
  const data = resource.value; const disabled = blocked || previewing || resource.loading || !!resource.error;
  const complexes = [...new Map(circles.filter(circle => circle.complexId).map(circle => [String(circle.complexId), { value: String(circle.complexId), label: circle.complexName }])).values()];
  const visibleCircles = circles.filter(circle => draft.complexId === 'all' || String(circle.complexId) === draft.complexId);
  const scoped = data ? scopedNarrationPupils(draft, data.pupils, circles) : [];
  const selectedIds = selected.filter(id => scoped.some(student => student.studentId === id)); const pupils = filterNarrationPupils(scoped, search);
  function update(patch: Partial<NarrationDraft>) { if (!disabled) { onChange({ ...draft, ...patch }); setReview(null); setValidation(''); } }
  function saveRanges(ranges: NarrationRange[]) { if (!editor) return; const assignments = { ...draft.assignments }; editor.ids.forEach(id => { assignments[String(id)] = ranges.map(range => ({ ...range })); });
    update({ assignments }); setEditor(null); setSelected([]); }
  async function prepare() {
    if (!data || disabled || locked.current) return; locked.current = true; setPreviewing(true); setValidation('');
    try { const payload = normalizeNarrationDraft(draft, data.pupils, circles, data.references); const preview = await api.preview(payload); setReview({ payload, preview }); }
    catch (cause) { setValidation(cause instanceof Error ? cause.message : 'تعذرت معاينة يوم السرد.'); }
    finally { locked.current = false; setPreviewing(false); }
  }
  return <><FormDialog visible={!choice && !editor} title={review ? 'معاينة يوم السرد' : 'فتح يوم سرد'} maxWidth={1024} busy={busy || previewing} onClose={onClose}
    footer={needsRefresh ? <ActionButton label="تحديث بيانات السرد" loading={busy} onPress={onRefresh} /> : <>
      <ActionButton label={review ? 'بدء يوم السرد' : 'معاينة يوم السرد'} loading={previewing || busy} disabled={disabled || (!!review && !review.preview.students.length)}
        onPress={() => { if (review) onCreate(review.payload, review.preview); else void prepare(); }} />
      {review && <ActionButton label="تعديل إعداد السرد" secondary disabled={disabled} onPress={() => setReview(null)} />}
    </>}>
    {!!(error || validation || resource.error) && <AppText accessibilityRole="alert">{error || validation || resource.error}</AppText>}
    {!!resource.error && <ActionButton label="إعادة تحميل تجهيز السرد" secondary disabled={busy} onPress={() => { void resource.reload(); }} />}
    {!review ? <>
      <View style={screenStyles.actions}>{(['full', 'manual'] as const).map(mode => <ActionButton key={mode} label={mode === 'full' ? 'المحفوظ كامل' : 'يدوي'} secondary={draft.mode !== mode}
        disabled={disabled} onPress={() => update({ mode })} />)}</View>
      <FormField label="اسم يوم السرد" maxLength={180} value={draft.name} editable={!disabled} onChangeText={name => update({ name })} />
      <View style={screenStyles.grid}><View style={screenStyles.field}><HijriDatePicker label="البداية" accessibilityLabel="بداية يوم السرد" value={draft.startDate} max={draft.endDate} disabled={disabled} onChange={startDate => update({ startDate })} /></View>
        <View style={screenStyles.field}><HijriDatePicker label="النهاية" accessibilityLabel="نهاية يوم السرد" value={draft.endDate} min={draft.startDate} disabled={disabled} onChange={endDate => update({ endDate })} /></View></View>
      <View style={screenStyles.actions}><ActionButton label={complexes.find(complex => complex.value === draft.complexId)?.label ?? 'كل المجمعات'} accessibilityLabel="مجمع يوم السرد" secondary disabled={disabled} onPress={() => setChoice('complex')} />
        <ActionButton label={draft.committeeIds.includes('all') ? 'كل الحلقات' : `الحلقات المختارة (${draft.committeeIds.length})`} accessibilityLabel="حلقات يوم السرد" secondary disabled={disabled} onPress={() => setChoice('circles')} /></View>
      {draft.mode === 'manual' && <>
        <FormField label="ابحث عن طالب للسرد" value={search} editable={!disabled} onChangeText={setSearch} />
        <View style={screenStyles.actions}><ActionButton label="اختيار كل الطلاب" secondary disabled={disabled || !pupils.length} onPress={() => setSelected(pupils.map(pupil => pupil.studentId))} />
          <ActionButton label="إلغاء اختيار الطلاب" secondary disabled={disabled || !selectedIds.length} onPress={() => setSelected([])} />
          <ActionButton label="تحديد نطاق للطلاب المختارين" disabled={disabled || !selectedIds.length} onPress={() => setEditor({ ids: selectedIds, ranges: [] })} /></View>
        <AppText>المشاركون ذوو النطاقات: {scoped.filter(student => draft.assignments[String(student.studentId)]?.length).length} من {scoped.length}</AppText>
        {pupils.map(pupil => <View key={pupil.studentId} style={{ gap: 10, paddingVertical: 10 }}><AppText style={screenStyles.bold}>{pupil.name}</AppText><AppText>{pupil.committeeName || 'بدون حلقة'}</AppText>
          <View style={screenStyles.actions}><ActionButton label={`${selectedIds.includes(pupil.studentId) ? 'إلغاء اختيار' : 'اختيار'} ${pupil.name}`} secondary={!selectedIds.includes(pupil.studentId)} disabled={disabled}
            onPress={() => setSelected(current => current.includes(pupil.studentId) ? current.filter(id => id !== pupil.studentId) : [...current, pupil.studentId])} />
            <ActionButton label={`نطاقات ${pupil.name}`} secondary disabled={disabled} onPress={() => setEditor({ ids: [pupil.studentId], ranges: draft.assignments[String(pupil.studentId)] ?? [] })} />
            {!!draft.assignments[String(pupil.studentId)]?.length && <ActionButton label={`إزالة ${pupil.name} من السرد`} secondary disabled={disabled} onPress={() => { const assignments = { ...draft.assignments }; delete assignments[String(pupil.studentId)]; update({ assignments }); }} />}</View>
          {(draft.assignments[String(pupil.studentId)] ?? []).map((range, index) => <AppText key={index}>{narrationRangeLabel(range, data?.references)}</AppText>)}
        </View>)}{!pupils.length && <AppText>لا يوجد طلاب مطابقون.</AppText>}
      </>}
    </> : <>
      <AppText style={screenStyles.bold}>{review.payload.name}</AppText><AppText>{formatHijriDate(review.preview.startDate)} إلى {formatHijriDate(review.preview.endDate)}</AppText>
      <AppText>المشاركون: {review.preview.students.length}، المستبعدون دون محفوظ: {review.preview.skippedStudents.length}</AppText>
      {review.preview.students.map(student => <View key={student.studentId} style={{ gap: 8, paddingVertical: 10 }}>
        <AppText style={screenStyles.bold}>{student.name} — {student.committeeName || 'بدون حلقة'}</AppText><AppText>إجمالي الأوجه: {student.totalFaces}</AppText>
        {student.ranges.map((range, index) => <AppText key={index}>{narrationRangeLabel(range, data?.references)}، {range.faces} وجه</AppText>)}
        {student.juzParts.map((part, index) => <AppText key={index}>الجزء {part.juz}: {narrationRangeLabel({ startSurah: part.start.surah, startAyah: part.start.ayah, endSurah: part.end.surah, endAyah: part.end.ayah }, data?.references)}، الصفحات {part.start.page}–{part.end.page}، {part.faces} وجه</AppText>)}
      </View>)}
      {review.preview.skippedStudents.map(student => <AppText key={student.studentId}>{student.name}: لا يوجد محفوظ حتى تاريخ البداية.</AppText>)}
      {!review.preview.students.length && <AppText accessibilityRole="alert">{narrationNoParticipants}</AppText>}
    </>}
  </FormDialog>
    <ChoiceDialog visible={choice === 'complex'} title="مجمع يوم السرد" options={[{ value: 'all', label: 'كل المجمعات' }, ...complexes]} value={draft.complexId}
      onChoose={complexId => { update({ complexId, committeeIds: ['all'] }); setSelected([]); }} onClose={() => setChoice(null)} />
    <FormDialog visible={choice === 'circles'} title="حلقات يوم السرد" onClose={() => setChoice(null)} footer={<ActionButton label="اعتماد حلقات السرد" onPress={() => setChoice(null)} />}>
      <ActionButton label={`كل الحلقات${draft.committeeIds.includes('all') ? ' ✓' : ''}`} secondary={!draft.committeeIds.includes('all')} onPress={() => update({ committeeIds: ['all'] })} />
      {visibleCircles.map(circle => <ActionButton key={circle.id} label={`${circle.name}${draft.committeeIds.includes(String(circle.id)) ? ' ✓' : ''}`} secondary={!draft.committeeIds.includes(String(circle.id))}
        onPress={() => { const ids = draft.committeeIds.filter(id => id !== 'all'); update({ committeeIds: ids.includes(String(circle.id)) ? ids.filter(id => id !== String(circle.id)) : [...ids, String(circle.id)] }); setSelected([]); }} />)}
    </FormDialog>
    {!!editor && !!data && <NarrationRangeEditor references={data.references} initial={editor.ranges} onSave={saveRanges} onClose={() => setEditor(null)} />}
  </>;
}
