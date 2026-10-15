import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { evaluateTrackSession } from '../../../../shared/grading-engine.js';
import { sessionAttendanceStatus } from '../../../../shared/session-attendance.js';
import { ActionButton } from '../ActionButton';
import { AppText } from '../AppText';
import { FormDialog } from '../FormDialog';
import { FormField } from '../FormField';
import { SectionCard, screenStyles } from '../ScreenLayout';
import { emptySessionSegmentDraft, sessionErrorCount, sessionRangeLabel, sessionTestPreview,
  type SessionAttempt, type SessionSegmentDraft, type SessionStudent, type SessionWeek } from '../../domain/sessionManagement';
import { useLoadedResource } from '../../hooks/useLoadedResource';
import type { SessionManagementApi } from '../../services/sessionManagementApi';
import { usePalette } from '../../theme';

export function TrackSessionTestDialog({ api, week, student, busy, blocked, error, onClose, onReconcile, onSave }: {
  api: SessionManagementApi; week: SessionWeek; student: SessionStudent; busy: boolean; blocked: boolean; error: string;
  onClose: () => void; onReconcile: () => void; onSave: (attempt: SessionAttempt, drafts: SessionSegmentDraft[]) => void;
}) {
  const palette = usePalette(); const loader = useCallback((signal: AbortSignal) => api.prepareTest(week, student.id, signal), [api, week, student.id]);
  const resource = useLoadedResource(loader); const attempt = resource.value;
  const [drafts, setDrafts] = useState<SessionSegmentDraft[]>([]); const [index, setIndex] = useState(0); const [validation, setValidation] = useState('');
  useEffect(() => { if (attempt) { setDrafts(attempt.segments.map(emptySessionSegmentDraft)); setIndex(0); setValidation(''); } }, [attempt]);
  const segment = attempt?.segments[index], draft = drafts[index]; const last = !!attempt && index === attempt.segments.length - 1;
  const disabled = busy || blocked || resource.loading || !!resource.error;
  function update(field: 'mistakes' | 'warnings' | 'hesitations', value: string) {
    if (disabled) return;
    setDrafts(current => current.map((item, position) => position === index ? { ...item, [field]: value, confirmed: false } : item)); setValidation('');
  }
  function next() {
    if (!attempt || !draft || disabled) return;
    try {
      sessionErrorCount(draft.mistakes); sessionErrorCount(draft.warnings); sessionErrorCount(draft.hesitations);
      const confirmed = drafts.map((item, position) => position === index ? { ...item, confirmed: true } : item);
      setDrafts(confirmed); setValidation('');
      if (last) onSave(attempt, confirmed); else setIndex(current => current + 1);
    } catch { setValidation('أدخل أعدادًا صحيحة من 0 إلى 1000 للأخطاء والترددات والتنبيهات.'); }
  }
  let preview: ReturnType<typeof sessionTestPreview> | null = null;
  let segmentGrade: number | null = null;
  if (attempt && draft && drafts.length === attempt.segments.length) {
    try {
      preview = sessionTestPreview(week, student, attempt, drafts);
      const candidate = drafts.map((item, position) => ({ recorded: position === index, mistakes: sessionErrorCount(item.mistakes),
        warnings: sessionErrorCount(item.warnings), hesitations: sessionErrorCount(item.hesitations) }));
      segmentGrade = evaluateTrackSession(week.policy, { attendanceStatus: sessionAttendanceStatus(student.detail ?? {}), segments: candidate }).segments[index]?.grade ?? null;
    } catch { preview = null; }
  }
  return <FormDialog visible title={`اختبار جلسة المسار — ${student.name}`} busy={busy} onClose={onClose}
    footer={blocked ? <ActionButton label="تحديث البيانات للتحقق" loading={busy} onPress={onReconcile} />
      : <View style={screenStyles.actions}>{index > 0 && <ActionButton label="المقطع السابق" secondary disabled={disabled} onPress={() => { setIndex(current => current - 1); setValidation(''); }} />}
        <ActionButton label={last ? 'حفظ الاختبار' : 'المقطع التالي'} loading={busy} disabled={disabled || !segment || !draft} onPress={next} /></View>}>
    {resource.loading && <AppText>جارٍ إعداد مقاطع الاختبار</AppText>}
    {!!resource.error && <><AppText accessibilityRole="alert" style={{ color: palette.error }}>{resource.error}</AppText>
      <ActionButton label="إعادة إعداد الاختبار" secondary disabled={busy || blocked} onPress={() => { void resource.reload(); }} /></>}
    {segment && draft && !resource.loading && !resource.error && <>
      <SectionCard title={`المقطع ${index + 1} من ${attempt?.segments.length}`}>
        <AppText>{segment.source === 'review' ? 'مقطع المراجعة' : 'مقطع الربط'} • {segment.max} درجات</AppText>
        <AppText>{sessionRangeLabel(segment.range)}</AppText>
        <AppText>درجة المقطع: {segmentGrade === null ? '—' : `${segmentGrade}/${segment.max}`}</AppText>
      </SectionCard>
      <View style={screenStyles.grid}>{([
        ['mistakes', 'الأخطاء'], ['hesitations', 'الترددات'], ['warnings', 'التنبيهات'],
      ] as const).map(([field, label]) => <View key={field} style={screenStyles.field}><FormField label={label} value={draft[field]}
        maxLength={4} keyboardType="number-pad" editable={!disabled} onChangeText={value => update(field, value)} /></View>)}</View>
      {!!preview && <AppText accessibilityLiveRegion="polite">درجة الحضور والمقاطع المؤكدة: {preview.grade}/{preview.max}</AppText>}
    </>}
    {!!(error || validation) && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error || validation}</AppText>}
    {!!error && !blocked && <ActionButton label="إعادة إعداد الاختبار" secondary disabled={busy || resource.loading} onPress={() => { void resource.reload(); }} />}
  </FormDialog>;
}
