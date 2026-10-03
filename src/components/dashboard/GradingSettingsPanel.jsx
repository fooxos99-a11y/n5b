import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useQueuedAutosave from '@/hooks/useQueuedAutosave';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ErrorState from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ManagementIconButton from '@/components/ui/management-icon-button';
import MultiSelectSetting from '@/components/ui/multi-select-setting';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import SettingsGroup from '@/components/dashboard/SettingsGroup';
import { weekDayOptions } from '@/lib/weekDayOptions';
import { gradingApi } from '@/services/gradingApi';
import { normalizeGradingPolicy, gradingPolicyErrors, trackSegmentDefinitions } from '../../../shared/grading-policy.js';

const AMOUNT = { min: 0, max: 1000, step: 'any' };
const RATIO = { min: 0, max: 1, step: '0.01' };
const MAX_FACES = 604;

const attendanceFields = [
  { path: 'weeklyProgram.attendance.present', label: 'حاضر', ...AMOUNT },
  { path: 'weeklyProgram.attendance.late', label: 'متأخر', ...AMOUNT },
  { path: 'weeklyProgram.attendance.excused', label: 'مستأذن', ...AMOUNT },
  { path: 'weeklyProgram.attendance.absent', label: 'غائب', ...AMOUNT },
];

const dailyFields = [
  { path: 'weeklyProgram.memorizationDaily', label: 'درجة الحفظ اليومية', ...AMOUNT },
  { path: 'weeklyProgram.linkDaily', label: 'درجة الربط اليومية', ...AMOUNT },
  { path: 'weeklyProgram.reviewDaily', label: 'درجة المراجعة اليومية', ...AMOUNT },
  { path: 'weeklyProgram.readingDaily', label: 'درجة القراءة الذاتية اليومية', ...AMOUNT },
];

const deductionFields = [
  { path: 'weeklyProgram.mistakeDeduction', label: 'خصم الخطأ/اللحن', ...RATIO },
  { path: 'weeklyProgram.warningDeduction', label: 'خصم التنبيه', ...RATIO },
  { path: 'weeklyProgram.hesitationDeduction', label: 'خصم التردد', ...RATIO },
  { path: 'weeklyProgram.linkFailThreshold', label: 'حد رسوب الربط', ...RATIO },
  { path: 'weeklyProgram.hizbDeductionLimit', label: 'حد الحزب في المراجعة', ...RATIO },
];

const programMarginField = { path: 'weeklyProgram.margin', label: 'هامش البرنامج الأسبوعي', ...AMOUNT };
const programFields = [...dailyFields, ...deductionFields, programMarginField];

const trackFields = [
  { path: 'trackSession.attendance', label: 'حاضر', ...AMOUNT },
  { path: 'trackSession.attendanceLate', label: 'متأخر', ...AMOUNT },
  { path: 'trackSession.attendanceExcused', label: 'مستأذن', ...AMOUNT },
  { path: 'trackSession.attendanceAbsent', label: 'غائب', ...AMOUNT },
  { path: 'trackSession.mistakeDeduction', label: 'خصم الخطأ/اللحن', ...AMOUNT },
  { path: 'trackSession.warningDeduction', label: 'خصم التنبيه', ...AMOUNT },
  { path: 'trackSession.hesitationDeduction', label: 'خصم التردد', ...AMOUNT },
];

const weeklySessionFields = [
  { path: 'weeklySession.attendance', label: 'حاضر', ...AMOUNT },
  { path: 'weeklySession.attendanceLate', label: 'متأخر', ...AMOUNT },
  { path: 'weeklySession.attendanceExcused', label: 'مستأذن', ...AMOUNT },
  { path: 'weeklySession.attendanceAbsent', label: 'غائب', ...AMOUNT },
];
const generalMarginField = { path: 'generalMargin', label: 'الهامش العام', ...AMOUNT };
const repetitionsField = { path: 'statistics.repetitionsPerFace', label: 'عدد التكرار لكل وجه', min: 0, max: 10000, step: '1', integer: true };

const numericFields = [
  ...attendanceFields,
  ...programFields,
  ...trackFields,
  ...weeklySessionFields,
  generalMarginField,
  repetitionsField,
];

const weekDayFields = [
  { key: 'workDays', label: 'أيام الحضور والحفظ والربط والمراجعة' },
  { key: 'readingDays', label: 'أيام القراءة الذاتية' },
];

const FACES_FIELD = { min: 2, max: MAX_FACES, integer: true };

const getAt = (source, path) => path.split('.').reduce((value, key) => value?.[key], source);

const setAt = (source, path, value) => {
  const [head, ...rest] = path.split('.');
  return { ...source, [head]: rest.length ? setAt(source?.[head] || {}, rest.join('.'), value) : value };
};

const rangeError = (raw, { min, max, integer = false }) => {
  const text = String(raw ?? '').trim();
  const value = Number(text);
  if (text && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))) return '';
  return integer ? `أدخل عددًا صحيحًا من ${min} إلى ${max}` : `أدخل قيمة من ${min} إلى ${max}`;
};


const toDraft = (policy) => {
  const normalized = normalizeGradingPolicy(policy);
  return {
    ...normalized,
    trackSession: { ...normalized.trackSession, segments: trackSegmentDefinitions(normalized) },
    weeklyProgram: {
      ...normalized.weeklyProgram,
      memorizationThresholds: normalized.weeklyProgram.memorizationThresholds.map((row, index) => ({
        ...row,
        rowKey: `threshold-${index}`,
        isBase: row.faces === 1,
      })),
    },
  };
};

/** Builds the policy payload from the draft: every numeric input becomes a number. */
const toPolicy = (draft) => {
  const withNumbers = numericFields.reduce((policy, field) => setAt(policy, field.path, Number(getAt(draft, field.path))), draft);
  return setAt(
    { ...withNumbers, trackSession: { ...withNumbers.trackSession, segmentCount: draft.trackSession.segments.length,
      segments: draft.trackSession.segments.map(({ source, max }) => ({ source, max: max === '' ? '' : Number(max) })) } },
    'weeklyProgram.memorizationThresholds',
    draft.weeklyProgram.memorizationThresholds.map(({ faces, threshold }) => ({ faces: Number(faces), threshold: Number(threshold) })),
  );
};

const validate = (draft) => {
  const errors = gradingPolicyErrors(toPolicy(draft));
  numericFields.forEach((field) => {
    const error = rangeError(getAt(draft, field.path), field);
    if (error) errors[field.path] = error;
  });
  weekDayFields.forEach(({ key }) => {
    if (!draft.weeklyProgram[key]?.length) errors[`weeklyProgram.${key}`] = 'اختر يومًا واحدًا على الأقل';
  });
  const seenFaces = new Set();
  draft.weeklyProgram.memorizationThresholds.forEach((row) => {
    const facesError = row.isBase ? '' : rangeError(row.faces, FACES_FIELD);
    const faces = Number(row.faces);
    if (facesError) errors[`${row.rowKey}.faces`] = facesError;
    else if (seenFaces.has(faces)) errors[`${row.rowKey}.faces`] = 'عدد الأوجه مكرر';
    seenFaces.add(faces);
    const thresholdError = rangeError(row.threshold, RATIO);
    if (thresholdError) errors[`${row.rowKey}.threshold`] = thresholdError;
  });
  return errors;
};

const FieldError = ({ id, message }) => (message
  ? <p id={id} className="text-xs font-bold leading-5 text-destructive">{message}</p>
  : null);

const NumberField = ({ field, draft, errors, onChange }) => {
  const id = `grading-${field.path.replace(/\./g, '-')}`;
  const error = errors[field.path];
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs leading-5 sm:text-sm">{field.label}</Label>
      <Input
        id={id}
        type="number"
        inputMode={field.integer ? 'numeric' : 'decimal'}
        min={field.min}
        max={field.max}
        step={field.step}
        value={getAt(draft, field.path) ?? ''}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={error ? 'border-destructive focus-visible:border-destructive' : undefined}
        onChange={(event) => onChange(field.path, event.target.value)}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
};

const GroupTitle = ({ children }) => <h3 className="text-sm font-black text-primary">{children}</h3>;
const FieldRow = ({ children }) => <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;

export const SettingsCard = ({ title, children }) => (
  <section aria-label={title} className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--app-shadow)] [font-family:var(--font-ui)]">
    <h2 className="border-b border-border px-4 py-3 text-base font-black text-primary sm:px-6">{title}</h2>
    <div className="divide-y divide-border">{children}</div>
  </section>
);


/**
 * One page of the grading policy: «program», «track» or «weekly».
 * Every valid change is saved automatically (the whole policy is sent).
 */
const GradingSettingsPanel = ({ section = 'program', extraCards = [], onStatusChange }) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [editVersion, setEditVersion] = useState(0);
  const rowSequence = useRef(0);
  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;

  const loadPolicy = useCallback(async () => {
    setLoadError('');
    setDraft(null);
    try {
      const result = await gradingApi.getPolicy();
      setDraft(toDraft(result?.policy));
    } catch (error) {
      setLoadError(error.message || 'تعذر تحميل إعدادات الدرجات.');
    }
  }, []);

  useEffect(() => {
    loadPolicy();
  }, [loadPolicy]);

  const errors = useMemo(() => (draft ? validate(draft) : {}), [draft]);
  const hasErrors = Object.keys(errors).length > 0;

  // Every user edit bumps the version; loading the policy does not, so nothing is saved on open.
  const edit = (update) => {
    setDraft(update);
    setEditVersion((version) => version + 1);
  };
  const updateField = (path, value) => edit((current) => setAt(current, path, value));

  const toggleDay = (key, day) => edit((current) => {
    const selected = current.weeklyProgram[key] || [];
    const next = selected.includes(Number(day))
      ? selected.filter((item) => item !== Number(day))
      : [...selected, Number(day)].sort((a, b) => a - b);
    return setAt(current, `weeklyProgram.${key}`, next);
  });

  const updateThresholds = (update) => edit((current) => setAt(
    current,
    'weeklyProgram.memorizationThresholds',
    update(current.weeklyProgram.memorizationThresholds),
  ));

  const updateThreshold = (rowKey, key, value) => updateThresholds((rows) => rows.map((row) => (
    row.rowKey === rowKey ? { ...row, [key]: value } : row
  )));

  const addThreshold = () => updateThresholds((rows) => {
    rowSequence.current += 1;
    const lastFaces = Math.max(...rows.map((row) => Number(row.faces) || 0));
    return [...rows, {
      rowKey: `threshold-new-${rowSequence.current}`,
      faces: Math.min(MAX_FACES, lastFaces + 1),
      threshold: rows[rows.length - 1]?.threshold ?? '',
      isBase: false,
    }];
  });

  const deleteThreshold = (rowKey) => updateThresholds((rows) => rows.filter((row) => row.isBase || row.rowKey !== rowKey));
  const updateSegments = update => edit(current => ({ ...current, trackSession: { ...current.trackSession, segments: update(current.trackSession.segments) } }));

  useEffect(() => { if (editVersion && hasErrors) statusRef.current?.('error'); }, [editVersion, hasErrors]);
  useQueuedAutosave({ channel: 'grading-policy', value: draft, enabled: Boolean(editVersion && draft && !hasErrors),
    save: (value) => gradingApi.savePolicy(toPolicy(value)), onStatus: (status) => statusRef.current?.(status),
    onError: (error) => toast({ title: 'تعذر حفظ إعدادات الدرجات', description: error.message, variant: 'destructive' }),
  });

  if (loadError) {
    return <div className="p-4 sm:p-6 [font-family:var(--font-ui)]"><ErrorState message={loadError} onRetry={loadPolicy} /></div>;
  }

  if (!draft) return <DashboardLoader className="min-h-[320px]" />;

  const fieldProps = { draft, errors, onChange: updateField };
  const thresholds = draft.weeklyProgram.memorizationThresholds;
  const summary = errors.total ? <div className="p-4"><FieldError id="grading-total-error" message={errors.total} /></div> : null;
  const sessionSection = section === 'track' ? 'trackSession' : 'weeklySession';
  const sessionDayField = <SettingsGroup>
    <Label htmlFor={`grading-${sessionSection}-day`}>يوم الجلسة</Label>
    <Select value={draft[sessionSection].sessionDay == null ? '' : String(draft[sessionSection].sessionDay)} onValueChange={value => updateField(`${sessionSection}.sessionDay`, Number(value))}>
      <SelectTrigger id={`grading-${sessionSection}-day`} className="sm:max-w-xs"><SelectValue placeholder="اختر يوم الجلسة" /></SelectTrigger>
      <SelectContent>{weekDayOptions.map(day => <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>)}</SelectContent>
    </Select>
  </SettingsGroup>;
  if (section === 'track') {
    return (
      <div className="space-y-4 [font-family:var(--font-ui)]">
        <SettingsCard title="درجات جلسة المسار">
          {summary}
          {sessionDayField}
          <SettingsGroup>
            <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-3">
              {trackFields.map((field) => <NumberField key={field.path} field={field} {...fieldProps} />)}
            </div>
          </SettingsGroup>
        </SettingsCard>
        <SettingsCard title="مقاطع جلسة المسار">
          <SettingsGroup>
            <Label htmlFor="track-segment-count">عدد المقاطع</Label>
            <Select value={String(draft.trackSession.segments.length)} onValueChange={value => updateSegments(rows => Array.from({ length: Number(value) }, (_, index) => rows[index] || { source: 'link', max: 0 }))}>
              <SelectTrigger id="track-segment-count" className="sm:max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({ length: 21 }, (_, count) => <SelectItem key={count} value={String(count)}>{count}</SelectItem>)}</SelectContent>
            </Select>
            {draft.trackSession.segments.map((segment, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="col-span-2 min-w-0 space-y-1.5 sm:col-span-1">
                  <Label htmlFor={`track-source-${index}`} className="text-xs leading-5 sm:text-sm">نوع المقطع {index + 1}</Label>
                  <Select value={segment.source} onValueChange={source => updateSegments(rows => rows.map((row, position) => position === index ? { ...row, source } : row))}>
                    <SelectTrigger id={`track-source-${index}`}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="link">الربط</SelectItem><SelectItem value="review">المراجعة</SelectItem></SelectContent>
                  </Select>
                </div>
                <NumberField field={{ path: `trackSession.segments.${index}.max`, label: `درجة المقطع ${index + 1}`, ...AMOUNT }} draft={draft} errors={errors}
                  onChange={(_path, max) => updateSegments(rows => rows.map((row, position) => position === index ? { ...row, max } : row))} />
                <ManagementIconButton className="self-end" tone="destructive" aria-label={`حذف المقطع ${index + 1}`} onClick={() => updateSegments(rows => rows.filter((_row, position) => position !== index))}><Trash2 className="h-4 w-4" /></ManagementIconButton>
              </div>
            ))}
            <Button type="button" variant="outline" className="gap-2" disabled={draft.trackSession.segments.length >= 20} onClick={() => updateSegments(rows => [...rows, { source: 'link', max: 0 }])}><Plus className="h-4 w-4" />إضافة مقطع</Button>
          </SettingsGroup>
        </SettingsCard>
      </div>
    );
  }

  if (section === 'weekly') {
    return (
      <div className="divide-y divide-border [font-family:var(--font-ui)]">
        {summary}
        {sessionDayField}
        <SettingsGroup>
          <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 lg:grid-cols-3">
            {weeklySessionFields.map((field) => <NumberField key={field.path} field={field} {...fieldProps} />)}
          </div>
        </SettingsGroup>
      </div>
    );
  }

  return (
    <div className="space-y-4 [font-family:var(--font-ui)]">
      {summary}
      <SettingsCard title="البرنامج الأسبوعي">
        <SettingsGroup>
          <GroupTitle>أيام الحضور</GroupTitle>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {weekDayFields.map(({ key, label }) => {
              const errorId = `grading-${key}-error`;
              const labelId = `grading-${key}-label`;
              return (
                <div key={key} className="min-w-0 space-y-2" role="group" aria-labelledby={labelId} aria-describedby={errors[`weeklyProgram.${key}`] ? errorId : undefined}>
                  <span id={labelId} className="block text-xs font-bold leading-5 text-foreground sm:text-sm">{label}</span>
                  <MultiSelectSetting
                    value={draft.weeklyProgram[key]}
                    options={weekDayOptions}
                    placeholder="اختر الأيام"
                    onToggle={(day) => toggleDay(key, day)}
                  />
                  <FieldError id={errorId} message={errors[`weeklyProgram.${key}`]} />
                </div>
              );
            })}
          </div>
        </SettingsGroup>
        <SettingsGroup>
          <GroupTitle>درجة الحضور</GroupTitle>
          <FieldRow>{attendanceFields.map((field) => <NumberField key={field.path} field={field} {...fieldProps} />)}</FieldRow>
        </SettingsGroup>
        <SettingsGroup>
          <GroupTitle>الدرجات اليومية</GroupTitle>
          <FieldRow>{dailyFields.map((field) => <NumberField key={field.path} field={field} {...fieldProps} />)}</FieldRow>
        </SettingsGroup>
        <SettingsGroup>
          <GroupTitle>الخصومات والحدود</GroupTitle>
          <FieldRow>
            {deductionFields.map((field) => <NumberField key={field.path} field={field} {...fieldProps} />)}
            <NumberField field={programMarginField} {...fieldProps} />
          </FieldRow>
        </SettingsGroup>
      </SettingsCard>

      <SettingsCard title="حدود الحفظ حسب عدد الأوجه">
      <SettingsGroup>
        <div className="overflow-x-auto sm:max-w-xl">
          <table className="w-full min-w-[280px] border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-right text-xs font-bold text-muted-foreground sm:text-sm">
                <th scope="col" className="px-1 font-bold">عدد الأوجه</th>
                <th scope="col" className="px-1 font-bold">حد الرسوب</th>
                <th scope="col" className="w-12 px-1"><span className="sr-only">حذف</span></th>
              </tr>
            </thead>
            <tbody>
              {thresholds.map((row, index) => {
                const facesError = errors[`${row.rowKey}.faces`];
                const thresholdError = errors[`${row.rowKey}.threshold`];
                const facesId = `grading-${row.rowKey}-faces`;
                const thresholdId = `grading-${row.rowKey}-threshold`;
                return (
                  <tr key={row.rowKey} className="align-top">
                    <td className="px-1">
                      {row.isBase ? (
                        <div className="flex h-12 items-center rounded-xl border border-border bg-muted/40 px-4 font-bold text-foreground">
                          {Number(row.faces).toLocaleString('ar-SA')}
                        </div>
                      ) : (
                        <Input
                          id={facesId}
                          type="number"
                          inputMode="numeric"
                          min={FACES_FIELD.min}
                          max={FACES_FIELD.max}
                          step="1"
                          value={row.faces}
                          aria-label={`عدد الأوجه، الصف ${index + 1}`}
                          aria-invalid={Boolean(facesError)}
                          aria-describedby={facesError ? `${facesId}-error` : undefined}
                          className={facesError ? 'border-destructive focus-visible:border-destructive' : undefined}
                          onChange={(event) => updateThreshold(row.rowKey, 'faces', event.target.value)}
                        />
                      )}
                      <FieldError id={`${facesId}-error`} message={facesError} />
                    </td>
                    <td className="px-1">
                      <Input
                        id={thresholdId}
                        type="number"
                        inputMode="decimal"
                        min={RATIO.min}
                        max={RATIO.max}
                        step={RATIO.step}
                        value={row.threshold}
                        aria-label={`حد الرسوب، الصف ${index + 1}`}
                        aria-invalid={Boolean(thresholdError)}
                        aria-describedby={thresholdError ? `${thresholdId}-error` : undefined}
                        className={thresholdError ? 'border-destructive focus-visible:border-destructive' : undefined}
                        onChange={(event) => updateThreshold(row.rowKey, 'threshold', event.target.value)}
                      />
                      <FieldError id={`${thresholdId}-error`} message={thresholdError} />
                    </td>
                    <td className="px-1">
                      {!row.isBase && (
                        <ManagementIconButton
                          tone="destructive"
                          aria-label={`حذف الصف ${index + 1}`}
                          title="حذف"
                          onClick={() => deleteThreshold(row.rowKey)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </ManagementIconButton>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs font-bold leading-5 text-muted-foreground">الدرجة المساوية للحد أو الأقل منه = راسب</p>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={addThreshold}
          disabled={thresholds.length >= MAX_FACES}
        >
          <Plus className="h-4 w-4" />
          إضافة
        </Button>
      </SettingsGroup>
      </SettingsCard>

      <SettingsCard title="الهامش والتكرار">
        <SettingsGroup>
          <FieldRow>
            <NumberField field={generalMarginField} {...fieldProps} />
            <NumberField field={repetitionsField} {...fieldProps} />
          </FieldRow>
        </SettingsGroup>
      </SettingsCard>

      {extraCards.map((card) => <SettingsCard key={card.title} title={card.title}>{card.content}</SettingsCard>)}
    </div>
  );
};

export default GradingSettingsPanel;
