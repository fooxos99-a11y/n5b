import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Share, View, useWindowDimensions } from 'react-native';
import { ActionButton } from '../components/ActionButton';
import { AppText } from '../components/AppText';
import { ChoiceDialog } from '../components/ChoiceDialog';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormDialog } from '../components/FormDialog';
import { FormField } from '../components/FormField';
import { ScreenLayout, screenStyles } from '../components/ScreenLayout';
import type { NativeSession } from '../domain/nativeSession';
import { canManageRegistration, filterRegistrationRequests, initialRegistrationAcceptanceForm,
  registrationAcceptanceCommittees, registrationActionMessage, registrationManagementComplexes, registrationManagementDate,
  registrationManagementFailure, registrationMemorizationLabel, registrationMutationNeedsReload, registrationRequestFilters,
  updateRegistrationAcceptanceForm, validateRegistrationAcceptance, type ManagedRegistrationRequest, type RegistrationAcceptanceForm,
  type RegistrationAcceptanceValidation, type RegistrationManagementData, type RegistrationRequestFilter, type RegistrationTestResult } from '../domain/registrationManagement';
import type { RegistrationManagementApi } from '../services/registrationManagementApi';
import { usePalette } from '../theme';
import { DashboardButton } from '../components/dashboard/DashboardButton';
import { DashboardIcon } from '../components/dashboard/DashboardIcon';
import { DashboardSelect } from '../components/dashboard/DashboardSelect';
import { ManagementEmpty, ManagementPanel, ManagementToolbar } from '../components/dashboard/ManagementPanel';

export type RegistrationManagementScreenProps = {
  api: RegistrationManagementApi; session: NativeSession; onBack: () => void; registrationLink: string;
  onShareLink?: (link: string) => Promise<void>; onCopyLink?: (link: string) => Promise<void>;
};
type ChoiceKind = 'filter' | 'complexId' | 'committeeId';

export function RegistrationManagementScreen({ api, session, onBack, registrationLink, onShareLink, onCopyLink }: RegistrationManagementScreenProps) {
  const palette = usePalette(); const { width } = useWindowDimensions();
  const acceptanceField = { flexBasis: width >= 640 ? '45%' : '100%' } as const;
  const allowed = canManageRegistration(session);
  const [data, setData] = useState<RegistrationManagementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RegistrationRequestFilter>('all');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [form, setForm] = useState<RegistrationAcceptanceForm | null>(null);
  const [results, setResults] = useState<Record<string, RegistrationTestResult>>({});
  const [validation, setValidation] = useState<Extract<RegistrationAcceptanceValidation, { valid: false }> | null>(null);
  const [pendingRejection, setPendingRejection] = useState<ManagedRegistrationRequest | null>(null);
  const [choiceKind, setChoiceKind] = useState<ChoiceKind>('filter');
  const [choiceVisible, setChoiceVisible] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const generation = useRef(0);
  const locked = useRef(false);
  const loadController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const contextKey = `${session.role}:${session.id}:${session.complex.registrationNumber}`;

  const reload = useCallback(async () => {
    if (!allowed) { setLoading(false); return; }
    const version = generation.current;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true); setLoadError('');
    try {
      const loaded = await api.load(controller.signal);
      if (version === generation.current && !controller.signal.aborted) { setData(loaded); setNeedsReload(false); }
    } catch (cause) {
      if (version === generation.current && !controller.signal.aborted) setLoadError(registrationManagementFailure(cause));
    } finally {
      if (version === generation.current && !controller.signal.aborted) setLoading(false);
    }
  }, [allowed, api]);

  useEffect(() => {
    generation.current += 1;
    setData(null); setActiveId(null); setForm(null); setResults({}); setValidation(null); setPendingRejection(null);
    setActionError(''); setMessage(''); setBusyKey(''); setSearch(''); setFilter('all'); setNeedsReload(false); setChoiceVisible(false); setOptionsOpen(false);
    locked.current = false;
    void reload();
    return () => { generation.current += 1; loadController.current?.abort(); mutationController.current?.abort(); };
  }, [contextKey, reload]);

  const activeRequest = useMemo(() => data?.requests.find(request => request.id === activeId) || null, [activeId, data]);
  const filtered = useMemo(() => filterRegistrationRequests(data?.requests || [], search, filter), [data, filter, search]);
  const complexes = useMemo(() => registrationManagementComplexes(data?.committees || []).map(complex => ({ value: String(complex.id), label: complex.name })), [data]);
  const committees = useMemo(() => registrationAcceptanceCommittees(data?.committees || [], form?.complexId || '').map(committee => ({ value: String(committee.id), label: committee.name })), [data, form?.complexId]);
  const busy = Boolean(busyKey);
  const disabled = busy || loading || needsReload || Boolean(loadError);

  useEffect(() => {
    if (activeId !== null && data && !loading && !activeRequest) { setActiveId(null); setForm(null); setResults({}); setValidation(null); }
  }, [activeId, activeRequest, data, loading]);

  async function mutate<T>(key: string, work: (signal: AbortSignal) => Promise<T>, apply: (result: T) => void) {
    if (!allowed || locked.current || loading || needsReload || loadError) return;
    locked.current = true;
    const version = generation.current, controller = new AbortController();
    mutationController.current = controller;
    setBusyKey(key); setActionError(''); setMessage('');
    try {
      const result = await work(controller.signal);
      if (version !== generation.current || controller.signal.aborted) return;
      apply(result);
      await reload();
    } catch (cause) {
      if (version === generation.current && !controller.signal.aborted) {
        setActionError(registrationManagementFailure(cause));
        if (registrationMutationNeedsReload(cause)) setNeedsReload(true);
      }
    } finally {
      if (version === generation.current && !controller.signal.aborted) { locked.current = false; setBusyKey(''); }
    }
  }

  function openAcceptance(request: ManagedRegistrationRequest) {
    if (disabled) return;
    setActiveId(request.id); setForm(initialRegistrationAcceptanceForm(request)); setResults({ ...request.testResults });
    setValidation(null); setActionError(''); setMessage('');
  }
  function closeAcceptance() {
    if (busy) return;
    setActiveId(null); setForm(null); setResults({}); setValidation(null); setActionError(''); setChoiceVisible(false);
  }
  function changeField(field: keyof RegistrationAcceptanceForm, value: string) {
    if (busy) return;
    setForm(current => current ? updateRegistrationAcceptanceForm(current, field, value) : current);
    setValidation(null); setActionError('');
  }
  function preliminary(request: ManagedRegistrationRequest) {
    void mutate(`pre-${request.id}`, signal => api.preliminaryAccept(request.id, signal), result => setMessage(registrationActionMessage('preliminary', result.deliveryStatus)));
  }
  function accept() {
    if (!activeRequest || !form || !data || disabled) return;
    const validated = validateRegistrationAcceptance(activeRequest, form, results, data.committees);
    if (!validated.valid) { setValidation(validated); return; }
    const requestId = activeRequest.id;
    void mutate(`accept-${requestId}`, signal => api.accept(requestId, validated.payload, signal), result => {
      setMessage(registrationActionMessage('accept', result.deliveryStatus));
      setActiveId(null); setForm(null); setResults({}); setValidation(null);
      setData(current => current ? { ...current, requests: current.requests.filter(request => request.id !== requestId) } : current);
    });
  }
  function reject() {
    if (!pendingRejection) return;
    const requestId = pendingRejection.id;
    void mutate(`reject-${requestId}`, signal => api.reject(requestId, signal), result => {
      setMessage(registrationActionMessage('reject', result.deliveryStatus)); setPendingRejection(null);
      setData(current => current ? { ...current, requests: current.requests.filter(request => request.id !== requestId) } : current);
    });
  }
  async function shareLink(copy: boolean) {
    if (locked.current || !registrationLink || !allowed) return;
    locked.current = true;
    const version = generation.current;
    setBusyKey(copy ? 'copy' : 'share'); setActionError('');
    try {
      if (copy) {
        if (!onCopyLink) return;
        await onCopyLink(registrationLink);
        if (version === generation.current) setMessage('نُسخ رابط التسجيل.');
      } else if (onShareLink) await onShareLink(registrationLink);
      else await Share.share({ message: registrationLink });
    } catch {
      if (version === generation.current) setActionError(copy ? 'تعذر نسخ الرابط. يمكنك نسخه من النص أدناه.' : 'تعذر مشاركة الرابط. حاول مرة أخرى.');
    } finally {
      if (version === generation.current) { locked.current = false; setBusyKey(''); }
    }
  }
  function openChoice(kind: ChoiceKind) { setChoiceKind(kind); setChoiceVisible(true); }
  const fieldError = (field: keyof RegistrationAcceptanceForm) => validation?.field === field ? validation.message : undefined;
  const choiceOptions = choiceKind === 'filter' ? registrationRequestFilters : choiceKind === 'complexId' ? complexes : committees;
  const choiceTitle = choiceKind === 'filter' ? 'تصفية الطلبات' : choiceKind === 'complexId' ? 'المجمع' : 'الحلقة';
  const choiceValue = choiceKind === 'filter' ? filter : form?.[choiceKind] || '';

  if (!allowed) return <ScreenLayout title="طلبات التسجيل" onBack={onBack}><AppText accessibilityRole="alert">ليست لديك صلاحية لإدارة طلبات التسجيل.</AppText></ScreenLayout>;

  return <ScreenLayout title="طلبات التسجيل" onBack={onBack} loading={loading} error={loadError} onRetry={() => { void reload(); }}>
    {data && <>
      <ManagementPanel>
        <ManagementToolbar>
          <ActionButton label={data.registrationEnabled ? 'التسجيل مفتوح' : 'التسجيل مغلق'} accessibilityLabel={data.registrationEnabled ? 'إغلاق التسجيل' : 'فتح التسجيل'}
            icon={data.registrationEnabled ? 'checkCircle' : 'closeCircle'} tone={data.registrationEnabled ? 'success' : 'danger'} disabled={disabled} loading={busyKey === 'config'}
            onPress={() => { void mutate('config', signal => api.setOpen(!data.registrationEnabled, signal), enabled => {
              setData(current => current ? { ...current, registrationEnabled: enabled } : current); setMessage(enabled ? 'فُتح التسجيل.' : 'أُغلق التسجيل.');
            }); }} />
          {onCopyLink && <ActionButton label="نسخ الرابط" icon="copy" secondary disabled={busy || !registrationLink} loading={busyKey === 'copy'} onPress={() => { void shareLink(true); }} />}
          <View style={{ flex: 1 }} /><DashboardButton label="خيارات طلبات التسجيل" icon="filter" iconOnly outlined disabled={busy} onPress={() => setOptionsOpen(true)} />
        </ManagementToolbar>
        {!filtered.length ? <ManagementEmpty>{data.requests.length ? 'لا توجد طلبات مطابقة للبحث والتصفية.' : 'لا توجد طلبات تسجيل حاليًا.'}</ManagementEmpty> : filtered.map(request => <View key={request.id}
          style={{ flexDirection: width >= 1024 ? 'row-reverse' : 'column', alignItems: width >= 1024 ? 'center' : 'stretch', gap: 12,
            paddingHorizontal: width < 640 ? 16 : 24, paddingVertical: 12, borderBottomWidth: 1, borderColor: palette.border }}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <AppText numberOfLines={1} style={{ fontFamily: 'CairoBold', fontSize: 16, lineHeight: 24 }}>{request.name}</AppText>
            {!!request.preliminarySentAt && <AppText style={{ fontSize: 12, lineHeight: 16, color: palette.muted }}>سُجل القبول المبدئي: {registrationManagementDate(request.preliminarySentAt)}</AppText>}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'flex-start', flexWrap: 'wrap', columnGap: 20, rowGap: 4 }}>
              {[{ label: 'العمر', value: `${request.age} سنة` }, { label: 'تاريخ التقديم', value: registrationManagementDate(request.createdAt) },
                ...(request.complexName ? [{ label: 'المجمع', value: request.complexName }] : []), ...(request.committeeName ? [{ label: 'الحلقة', value: request.committeeName }] : []),
                { label: 'المحفوظ', value: registrationMemorizationLabel(request) }].map(detail => <AppText key={detail.label}
                  style={{ fontSize: 14, lineHeight: 20, color: palette.muted, flexShrink: 1 }}><AppText style={{ fontFamily: 'CairoBold', fontSize: 14, lineHeight: 20, color: palette.muted }}>{detail.label}: </AppText>
                  <AppText style={{ fontFamily: 'CairoBlack', fontSize: 14, lineHeight: 20 }}>{detail.value}</AppText></AppText>)}
            </View>
          </View>
          <View style={{ flexDirection: 'row-reverse', gap: 8, flexShrink: 0 }}>
            <View style={{ flex: width >= 1024 ? undefined : 1 }}><ActionButton label="قبول مبدئي" compact accessibilityLabel={`قبول مبدئي لطلب ${request.name}`} secondary disabled={disabled} loading={busyKey === `pre-${request.id}`} onPress={() => preliminary(request)} /></View>
            <View style={{ flex: width >= 1024 ? undefined : 1 }}><ActionButton label="قبول نهائي" compact accessibilityLabel={`قبول نهائي لطلب ${request.name}`} disabled={disabled} onPress={() => openAcceptance(request)} /></View>
            <View style={{ flex: width >= 1024 ? undefined : 1 }}><ActionButton label="رفض" compact accessibilityLabel={`رفض طلب ${request.name}`} tone="destructive" secondary disabled={disabled} onPress={() => { setPendingRejection(request); setActionError(''); }} /></View>
          </View>
        </View>)}
      </ManagementPanel>
      {!!message && !activeRequest && <AppText accessibilityLiveRegion="polite">{message}</AppText>}
      {!!actionError && !activeRequest && !pendingRejection && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{actionError}</AppText>}
      {needsReload && !activeRequest && !pendingRejection && <AppText accessibilityRole="alert">حدّث الطلبات للتحقق من نتيجة العملية قبل إعادة المحاولة.</AppText>}
      <FormDialog visible={optionsOpen && !choiceVisible} title="خيارات طلبات التسجيل" busy={busy} onClose={() => setOptionsOpen(false)}>
        <View style={screenStyles.actions}>
          <ActionButton label="مشاركة الرابط" secondary disabled={busy || !registrationLink} loading={busyKey === 'share'} onPress={() => { void shareLink(false); }} />
          <ActionButton label="تحديث الطلبات" icon="refresh" secondary disabled={busy} loading={loading} onPress={() => { setActionError(''); void reload(); }} />
        </View>
        {registrationLink ? <AppText selectable>{registrationLink}</AppText> : <AppText>رابط التسجيل غير متاح.</AppText>}
        <FormField label="البحث في الطلبات" value={search} onChangeText={setSearch} placeholder="اسم أو هوية أو جوال" />
        <DashboardSelect label="تصفية الطلبات" value={registrationRequestFilters.find(option => option.value === filter)?.label || 'جميع الطلبات'} grow onPress={() => openChoice('filter')} />
        <AppText>{filtered.length} من {data.requests.length} طلب</AppText>
      </FormDialog>
    </>}
    <FormDialog visible={Boolean(activeRequest && form) && !choiceVisible} title="قبول طلب التسجيل" titleColor={palette.primary} showClose={false} maxWidth={896} busy={busy} onClose={closeAcceptance}
      footer={activeRequest && form ? <View style={[screenStyles.actions, { width: '100%', minWidth: 0, flexShrink: 1 }]}>
        <ActionButton label="إغلاق" secondary disabled={busy} onPress={closeAcceptance} />
        <ActionButton label="قبول مبدئي" secondary disabled={disabled} loading={busyKey === `pre-${activeRequest.id}`} onPress={() => preliminary(activeRequest)} />
        <ActionButton label="قبول نهائي" disabled={disabled} loading={busyKey === `accept-${activeRequest.id}`} onPress={accept} />
        {(needsReload || loadError) && <ActionButton label="تحديث الطلبات" secondary disabled={busy} onPress={() => { setActionError(''); void reload(); }} />}
      </View> : undefined}>
      {activeRequest && form && <>
        <View style={[screenStyles.grid, { gap: 16 }]}>
          <View style={[screenStyles.field, acceptanceField]}><FormField label="اسم الطالب" compact value={form.name} onChangeText={value => changeField('name', value)} editable={!busy} maxLength={180} error={fieldError('name')} /></View>
          <View style={[screenStyles.field, acceptanceField, { gap: 6 }]}><AppText style={{ fontFamily: 'CairoBold', fontSize: 14, lineHeight: 20 }}>المجمع</AppText><DashboardSelect label="المجمع" value={complexes.find(option => option.value === form.complexId)?.label || (complexes.length ? 'اختر المجمع' : 'لا توجد مجمعات متاحة')}
            grow disabled={busy || !complexes.length} onPress={() => openChoice('complexId')} />{!!fieldError('complexId') && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{fieldError('complexId')}</AppText>}</View>
          <View style={[screenStyles.field, acceptanceField, { gap: 6 }]}><AppText style={{ fontFamily: 'CairoBold', fontSize: 14, lineHeight: 20 }}>الحلقة</AppText><DashboardSelect label="الحلقة" value={committees.find(option => option.value === form.committeeId)?.label || (!form.complexId ? 'اختر المجمع أولًا' : committees.length ? 'اختر الحلقة' : 'لا توجد حلقات متاحة')}
            grow disabled={busy || !form.complexId || !committees.length} onPress={() => openChoice('committeeId')} />{!!fieldError('committeeId') && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{fieldError('committeeId')}</AppText>}</View>
          <View style={[screenStyles.field, acceptanceField]}><FormField label="رقم الجوال" accessibilityLabel="رقم جوال ولي الأمر" compact value={form.guardianPhone} onChangeText={value => changeField('guardianPhone', value)} editable={!busy} keyboardType="phone-pad" error={fieldError('guardianPhone')} /></View>
          <View style={[screenStyles.field, acceptanceField]}><FormField label="رقم الهوية" compact value={form.nationalId} onChangeText={value => changeField('nationalId', value)} editable={!busy} keyboardType="number-pad" error={fieldError('nationalId')} /></View>
          <View style={[screenStyles.field, acceptanceField]}><FormField label="العمر" compact value={form.age} onChangeText={value => changeField('age', value)} editable={!busy} keyboardType="number-pad" error={fieldError('age')} /></View>
          <View style={[screenStyles.field, acceptanceField]}><FormField label="رقم الدخول" compact value={form.loginNumber} onChangeText={value => changeField('loginNumber', value)} editable={!busy} maxLength={80} keyboardType="number-pad" autoComplete="off" error={fieldError('loginNumber')} /></View>
          <View style={[screenStyles.field, acceptanceField]}><FormField label="كلمة المرور" compact value={form.password} onChangeText={value => changeField('password', value)} editable={!busy} password maxLength={256} autoComplete="new-password" error={fieldError('password')} /></View>
        </View>
        <View style={{ borderTopWidth: 1, borderColor: palette.border, paddingTop: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}><DashboardIcon name="clipboard" size={16} color={palette.primary} />
            <AppText accessibilityRole="header" style={{ fontFamily: 'CairoBlack', fontSize: 14, color: palette.primary }}>اختبار المحفوظ</AppText></View>
        {activeRequest.memorization.items.length ? activeRequest.memorization.items.map(item => <View key={item.id}
          style={{ flexDirection: width < 640 ? 'column' : 'row-reverse', alignItems: width < 640 ? 'stretch' : 'center', gap: 8, borderBottomWidth: 1, borderColor: palette.border, paddingVertical: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}><AppText style={{ fontFamily: 'CairoBlack' }}>{item.label}</AppText>
            <AppText style={{ fontSize: 12, fontFamily: 'CairoBold', color: palette.muted }}>{item.type === 'juz' ? 'جزء كامل' : 'نطاق جزئي'}</AppText></View>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            <View style={{ flex: width < 640 ? 1 : undefined }}><ActionButton label="ناجح" icon="check" selected={results[item.id] === 'passed'} tone={results[item.id] === 'passed' ? 'success' : 'default'} accessibilityLabel={`ناجح: ${item.label}`} secondary={results[item.id] !== 'passed'} disabled={busy}
              onPress={() => { setResults(current => ({ ...current, [item.id]: 'passed' })); setValidation(null); setActionError(''); }} />
            </View><View style={{ flex: width < 640 ? 1 : undefined }}><ActionButton label="راسب" icon="close" selected={results[item.id] === 'failed'} tone={results[item.id] === 'failed' ? 'destructive' : 'default'} accessibilityLabel={`راسب: ${item.label}`} secondary={results[item.id] !== 'failed'} disabled={busy}
              onPress={() => { setResults(current => ({ ...current, [item.id]: 'failed' })); setValidation(null); setActionError(''); }} />
            </View>
          </View>
        </View>) : <AppText style={{ color: palette.muted, fontSize: 14 }}>الطالب لم يحدد محفوظًا سابقًا.</AppText>}
        </View>
        {validation?.field === 'testResults' && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{validation.message}</AppText>}
        {!!actionError && <AppText accessibilityRole="alert" style={{ color: palette.error }}>{actionError}</AppText>}
        {!!message && <AppText accessibilityLiveRegion="polite">{message}</AppText>}
        {needsReload && <AppText>حدّث الطلبات للتحقق من نتيجة العملية قبل إعادة المحاولة.</AppText>}
      </>}
    </FormDialog>
    <ChoiceDialog visible={choiceVisible} title={choiceTitle} options={choiceOptions} value={choiceValue}
      onChoose={value => { if (choiceKind === 'filter') setFilter(value as RegistrationRequestFilter); else changeField(choiceKind, value); }} onClose={() => setChoiceVisible(false)} />
    <ConfirmDialog visible={Boolean(pendingRejection)} title="تأكيد رفض الطلب" message={`سيُرفض طلب ${pendingRejection?.name || 'الطالب'} ويُحذف نهائيًا.`}
      confirmLabel="رفض الطلب" busy={busy} confirmDisabled={disabled}
      error={actionError || (needsReload || loadError ? 'أغلق هذا التنبيه وحدّث الطلبات قبل إعادة المحاولة.' : undefined)} onConfirm={reject}
      onClose={() => { if (!busy) { setPendingRejection(null); setActionError(''); } }} />
  </ScreenLayout>;
}
