import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { FormField } from '../components/FormField';
import { usePalette } from '../theme';
import { addRegistrationRange, clearRegistrationRangeDraft, emptyRegistrationForm, emptyRegistrationRangeDraft, normalizeRegistrationContext, registrationCommittees,
  registrationJuzOptions, registrationRangeLabel, removeRegistrationRange, updateRegistrationField, updateRegistrationRangeDraft,
  registrationSubmissionFailure, validateRegistrationForm, type PublicRegistrationConfiguration, type RegistrationForm, type RegistrationRange,
  type RegistrationRangeDraft, type RegistrationRequestPayload, type RegistrationSubmissionResult, type RegistrationValidation } from '../domain/registrationForm';

export type RegistrationScreenProps = {
  registrationNumber: string;
  loadRegistration: (registrationNumber: string, signal?: AbortSignal) => Promise<PublicRegistrationConfiguration>;
  submitRegistration: (payload: RegistrationRequestPayload, registrationNumber: string, signal?: AbortSignal) => Promise<RegistrationSubmissionResult>;
  onBack: () => void;
};
type Choice = 'complexId' | 'committeeId' | 'startJuz' | 'endJuz';
type Option = { value: string; label: string };

function ChoiceField({ label, placeholder, value, options, disabled, error, onOpen }: {
  label: string; placeholder: string; value: string; options: readonly Option[]; disabled: boolean; error?: string; onOpen: () => void;
}) {
  const palette = usePalette();
  return <View style={styles.field}>
    <AppText style={styles.label}>{label}</AppText>
    <ActionButton label={options.find(option => option.value === value)?.label || placeholder} secondary disabled={disabled} onPress={onOpen} />
    {error ? <AppText accessibilityRole="alert" style={{ color: palette.error }}>{error}</AppText> : null}
  </View>;
}

export function RegistrationScreen({ registrationNumber, loadRegistration, submitRegistration, onBack }: RegistrationScreenProps) {
  const palette = usePalette();
  const [config, setConfig] = useState<PublicRegistrationConfiguration | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<RegistrationForm>(emptyRegistrationForm);
  const [draft, setDraft] = useState<RegistrationRangeDraft>(emptyRegistrationRangeDraft);
  const [ranges, setRanges] = useState<RegistrationRange[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [validation, setValidation] = useState<Extract<RegistrationValidation, { valid: false }> | null>(null);
  const [submissionError, setSubmissionError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const generation = useRef(0);
  const submissionLocked = useRef(false);
  const loadController = useRef<AbortController | null>(null);
  const submitController = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    const version = ++generation.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true); setLoadError(''); setConfig(null);
    let contextValidated = false;
    try {
      const context = normalizeRegistrationContext(registrationNumber);
      contextValidated = true;
      const loaded = await loadRegistration(context, controller.signal);
      if (version === generation.current && !controller.signal.aborted) setConfig(loaded);
    } catch {
      if (version === generation.current && !controller.signal.aborted) setLoadError(contextValidated ? 'تعذر تحميل صفحة التسجيل.' : 'رابط التسجيل غير صالح.');
    } finally {
      if (version === generation.current && !controller.signal.aborted) setLoading(false);
    }
  }, [loadRegistration, registrationNumber]);

  useEffect(() => {
    setForm(emptyRegistrationForm()); setDraft(emptyRegistrationRangeDraft()); setRanges([]);
    setChoice(null); setValidation(null); setSubmissionError(''); setSuccess(false); setSubmitting(false);
    submissionLocked.current = false;
    void reload();
    return () => { generation.current += 1; loadController.current?.abort(); submitController.current?.abort(); };
  }, [reload]);

  const complexes = useMemo(() => (config?.complexes || []).map(complex => ({ value: String(complex.id), label: complex.name })), [config]);
  const committees = useMemo(() => config ? registrationCommittees(config, form.complexId).map(committee => ({ value: String(committee.id), label: committee.name })) : [], [config, form.complexId]);
  const juzs = useMemo(() => config ? registrationJuzOptions(config).map(juz => ({ value: String(juz), label: `الجزء ${juz}` })) : [], [config]);
  const choiceOptions = choice === 'complexId' ? complexes : choice === 'committeeId' ? committees : juzs;
  const choiceTitle = choice === 'complexId' ? 'المجمع' : choice === 'committeeId' ? 'الحلقة' : choice === 'startJuz' ? 'من الجزء' : 'إلى الجزء';
  const selectedChoice = choice === 'complexId' || choice === 'committeeId' ? form[choice] : choice ? draft[choice] : '';
  const fieldError = (field: keyof RegistrationForm) => validation?.field === field ? validation.message : undefined;

  function changeField(field: keyof RegistrationForm, value: string) {
    setForm(current => updateRegistrationField(current, field, value));
    setValidation(null); setSubmissionError('');
  }
  function select(value: string) {
    if (!choice || submitting) return;
    if (choice === 'complexId' || choice === 'committeeId') changeField(choice, value);
    else { setDraft(current => updateRegistrationRangeDraft(current, choice, value)); setValidation(null); setSubmissionError(''); }
    setChoice(null);
  }
  function addRange() {
    const result = addRegistrationRange(ranges, draft);
    if (!result.valid) { setValidation({ valid: false, field: 'rangeDraft', message: result.message }); return; }
    setRanges(result.ranges); setDraft(emptyRegistrationRangeDraft()); setValidation(null); setSubmissionError('');
  }
  async function submit() {
    if (!config || submitting || success || submissionLocked.current) return;
    const result = validateRegistrationForm(form, config, draft, ranges);
    if (!result.valid) { setValidation(result); return; }
    submissionLocked.current = true;
    setSubmitting(true); setValidation(null); setSubmissionError('');
    const version = generation.current;
    const controller = new AbortController();
    submitController.current = controller;
    try {
      await submitRegistration(result.payload, normalizeRegistrationContext(registrationNumber), controller.signal);
      if (version === generation.current && !controller.signal.aborted) {
        setSuccess(true); setForm(emptyRegistrationForm()); setRanges([]); setDraft(emptyRegistrationRangeDraft());
      }
    } catch (cause) {
      if (version === generation.current && !controller.signal.aborted) {
        const failure = registrationSubmissionFailure(cause);
        if (failure.kind === 'closed') setConfig(current => current ? { ...current, enabled: false } : current);
        setSubmissionError(failure.message);
      }
    } finally {
      if (version === generation.current && !controller.signal.aborted) { submissionLocked.current = false; setSubmitting(false); }
    }
  }

  return <KeyboardAvoidingView style={[styles.screen, { backgroundColor: palette.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.header}><AppText accessibilityRole="header" style={styles.title}>طلب التسجيل</AppText><ActionButton label="رجوع" secondary onPress={onBack} /></View>
      <View style={[styles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
        {loading ? <View style={styles.status} accessibilityLiveRegion="polite"><ActivityIndicator color={palette.primary} /><AppText>جارٍ تحميل صفحة التسجيل…</AppText></View>
          : loadError ? <View style={styles.status}><AppText accessibilityRole="alert" style={{ color: palette.error }}>{loadError}</AppText><ActionButton label="إعادة المحاولة" secondary onPress={() => { void reload(); }} /></View>
            : !config?.enabled ? <View style={styles.status}><AppText style={styles.label}>التسجيل مغلق حالياً</AppText><AppText style={{ color: palette.muted }}>يمكنك المحاولة مرة أخرى عند فتح باب التسجيل.</AppText></View>
              : success ? <View style={styles.status}><AppText accessibilityLiveRegion="polite" style={styles.label}>وصل طلبك إلى الإدارة.</AppText><AppText style={{ color: palette.muted }}>يُنشأ حساب الطالب بعد قبول الطلب.</AppText></View>
                : <>
                  <View style={styles.formGrid}>
                    <View style={styles.field}><FormField label="اسم الطالب" value={form.name} onChangeText={value => changeField('name', value)} editable={!submitting} maxLength={180} autoComplete="name" error={fieldError('name')} /></View>
                    <View style={styles.field}><FormField label="رقم جوال ولي الأمر" value={form.guardianPhone} onChangeText={value => changeField('guardianPhone', value)} editable={!submitting} maxLength={40} keyboardType="phone-pad" error={fieldError('guardianPhone')} /></View>
                    <View style={styles.field}><FormField label="رقم الهوية" value={form.nationalId} onChangeText={value => changeField('nationalId', value)} editable={!submitting} maxLength={40} keyboardType="number-pad" error={fieldError('nationalId')} /></View>
                    <View style={styles.field}><FormField label="العمر" value={form.age} onChangeText={value => changeField('age', value)} editable={!submitting} maxLength={3} keyboardType="number-pad" error={fieldError('age')} /></View>
                    <ChoiceField label="المجمع" placeholder={complexes.length ? 'اختر المجمع' : 'لا توجد مجمعات متاحة'} value={form.complexId} options={complexes} disabled={submitting || !complexes.length} error={fieldError('complexId')} onOpen={() => setChoice('complexId')} />
                    <ChoiceField label="الحلقة" placeholder={!form.complexId ? 'اختر المجمع أولًا' : committees.length ? 'اختر الحلقة' : 'لا توجد حلقات في هذا المجمع'} value={form.committeeId} options={committees} disabled={submitting || !form.complexId || !committees.length} error={fieldError('committeeId')} onOpen={() => setChoice('committeeId')} />
                  </View>
                  <AppText accessibilityRole="header" style={styles.label}>ماهو محفوظك؟</AppText>
                  <View style={[styles.rangeCard, { borderColor: palette.border }]}>
                    <ChoiceField label="من الجزء" placeholder="اختر بداية الجزء" value={draft.startJuz} options={juzs} disabled={submitting} onOpen={() => setChoice('startJuz')} />
                    <ChoiceField label="إلى الجزء" placeholder="اختر نهاية الجزء" value={draft.endJuz} options={juzs} disabled={submitting} onOpen={() => setChoice('endJuz')} />
                    <ActionButton label="إضافة" secondary disabled={submitting} onPress={addRange} />
                    {draft.startJuz || draft.endJuz ? <ActionButton label="مسح النطاق" secondary disabled={submitting} onPress={() => { setDraft(clearRegistrationRangeDraft()); setValidation(null); setSubmissionError(''); }} /> : null}
                  </View>
                  <AppText style={styles.label}>ملخص المحفوظ</AppText>
                  {ranges.length ? ranges.map((range, index) => <View key={`${range.startJuz}-${range.endJuz}`} style={styles.rangeRow}>
                    <AppText style={styles.rangeLabel}>{registrationRangeLabel(range)}</AppText>
                    <ActionButton label="حذف" secondary disabled={submitting} onPress={() => { setRanges(current => removeRegistrationRange(current, index)); setValidation(null); setSubmissionError(''); }} />
                  </View>) : <AppText style={{ color: palette.muted }}>لا يوجد محفوظ محدد.</AppText>}
                  {validation && ['rangeDraft', 'context'].includes(validation.field) ? <AppText accessibilityRole="alert" style={{ color: palette.error }}>{validation.message}</AppText> : null}
                  {submissionError ? <AppText accessibilityRole="alert" style={{ color: palette.error }}>{submissionError}</AppText> : null}
                  <ActionButton label="إرسال الطلب" loading={submitting} disabled={!complexes.length || !config.committees.length} onPress={() => { void submit(); }} />
                </>}
      </View>
    </ScrollView>
    <Modal visible={choice !== null} transparent animationType="slide" onRequestClose={() => setChoice(null)}>
      <View style={styles.modalBackdrop}><View accessibilityViewIsModal style={[styles.modalCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <AppText accessibilityRole="header" style={styles.label}>{choiceTitle}</AppText>
        <FlatList data={choiceOptions} keyExtractor={option => option.value} keyboardShouldPersistTaps="handled" style={styles.optionList}
          contentContainerStyle={styles.options} renderItem={({ item }) => <ActionButton label={`${item.label}${selectedChoice === item.value ? ' ✓' : ''}`} secondary={selectedChoice !== item.value} onPress={() => select(item.value)} />}
          ListEmptyComponent={<AppText style={{ color: palette.muted }}>لا توجد خيارات متاحة.</AppText>} />
        <ActionButton label="إغلاق" secondary onPress={() => setChoice(null)} />
      </View></View>
    </Modal>
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({ screen: { flex: 1 }, content: { flexGrow: 1, width: '100%', maxWidth: 960, alignSelf: 'center', padding: 16, gap: 16 },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, title: { fontFamily: 'CairoBold', fontSize: 24, lineHeight: 38 },
  card: { borderWidth: 1, borderRadius: 24, padding: 18, gap: 16 }, status: { paddingVertical: 28, alignItems: 'center', gap: 18 },
  label: { fontFamily: 'CairoBold', fontSize: 17 }, formGrid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 16 },
  field: { flexGrow: 1, flexBasis: 280, minWidth: 0, gap: 8 }, rangeCard: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 14 },
  rangeRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }, rangeLabel: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 560, maxHeight: '85%', borderWidth: 1, borderRadius: 24, padding: 18, gap: 16 },
  optionList: { flexGrow: 0, flexShrink: 1 }, options: { gap: 10 },
});
