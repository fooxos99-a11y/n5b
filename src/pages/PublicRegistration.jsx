import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useSearchParams } from '@/lib/router';
import { CheckCircle2, LockKeyhole, Plus, Send, X } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';
import { applyTheme, getCurrentTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import LabeledField from '@/components/ui/labeled-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toaster } from '@/components/ui/toaster';
import { useToast } from '@/components/ui/use-toast';
import LoadingScreen from '@/components/LoadingScreen';
import ErrorState from '@/components/ui/error-state';
import { resolveAssetUrl } from '@/lib/assetUrl';
import { expandJuzRanges, formatJuzRange, mergeJuzRanges } from '@/lib/juzRanges';
import { studentsApi } from '@/services/studentsApi';
import { useSiteConfig } from '@/site/SiteProvider';

const emptyDraft = {
  startJuz: '',
  endJuz: '',
};

const toEnglishDigits = (value = '') =>
  String(value).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicIndex = arabicDigits.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    return String(persianDigits.indexOf(digit));
  });

const digitsOnly = (value = '', max = 10) => toEnglishDigits(value).replace(/\D/g, '').slice(0, max);
const numberText = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');
const PublicRegistration = () => {
  const site = useSiteConfig();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const registrationNumber = searchParams.get('registrationNumber')?.trim() || '';
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionPending = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [availableJuzs, setAvailableJuzs] = useState([]);
  const [complexes, setComplexes] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState({
    name: '',
    guardianPhone: '',
    nationalId: '',
    age: '',
    complexId: '',
    committeeId: '',
  });
  const [rangeDraft, setRangeDraft] = useState(emptyDraft);
  const [memorizedRanges, setMemorizedRanges] = useState([]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setLoadError('');
    studentsApi.getPublicRegistration(registrationNumber)
      .then((data) => {
        if (!mounted) return;
        setEnabled(Boolean(data.enabled));
        setComplexes(data.complexes || []);
        setCommittees(data.committees || []);
        setAvailableJuzs((data.juzRanges || []).map((range) => Number(range.juz)).filter(Boolean));
      })
      .catch((error) => {
        if (!mounted) return;
        setLoadError(error.message || 'تعذر تحميل صفحة التسجيل.');
        toast({ title: 'تعذر تحميل صفحة التسجيل', description: error.message, variant: 'destructive' });
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [registrationNumber, loadAttempt, toast]);

  useEffect(() => {
    if (!enabled) return;
    const previousTheme = getCurrentTheme();
    applyTheme('light');
    return () => { applyTheme(previousTheme); };
  }, [enabled]);

  const juzOptions = useMemo(() => (
    availableJuzs.length ? [...new Set(availableJuzs)].sort((first, second) => first - second) : Array.from({ length: 30 }, (_, index) => index + 1)
  ), [availableJuzs]);

  const setDraftField = (key, value) => {
    setSubmitSuccess('');
    setFormError('');
    setRangeDraft((current) => ({
      ...current,
      [key]: value,
      ...(key === 'startJuz' && !current.endJuz ? { endJuz: value } : {}),
    }));
  };

  const setFormField = (key, value) => {
    setSubmitSuccess('');
    setFormError('');
    setForm((current) => ({ ...current, [key]: value, ...(key === 'complexId' ? { committeeId: '' } : {}) }));
  };

  const showFormError = (message) => {
    setFormError(message);
    toast({ title: message, variant: 'destructive' });
    return false;
  };

  const addMemorizedRange = () => {
    if (!rangeDraft.startJuz || !rangeDraft.endJuz) {
      toast({ title: 'حدد بداية ونهاية نطاق الأجزاء', variant: 'destructive' });
      return;
    }
    const startJuz = Number(rangeDraft.startJuz);
    const endJuz = Number(rangeDraft.endJuz);
    if (startJuz > endJuz) {
      toast({ title: 'جزء البداية يجب أن يكون قبل جزء النهاية', variant: 'destructive' });
      return;
    }
    setMemorizedRanges((current) => mergeJuzRanges([...current, { startJuz, endJuz }]));
    setRangeDraft(emptyDraft);
  };

  const validateForm = () => {
    const name = String(form.name || '').replace(/\s+/g, ' ').trim();
    if (name.length < 2) {
      return showFormError('اكتب اسم الطالب.');
    }
    const age = Number(form.age);
    if (!Number.isInteger(age) || age < 4 || age > 120) {
      return showFormError('العمر غير صحيح.');
    }
    if (!complexes.some(row => String(row.id) === form.complexId)) return showFormError('اختر المجمع.');
    if (!committees.some(row => String(row.id) === form.committeeId && String(row.complexId) === form.complexId)) return showFormError('اختر الحلقة.');
    if (Object.values(rangeDraft).some(Boolean)) {
      return showFormError('أضف نطاق المحفوظ أو امسحه قبل إرسال الطلب.');
    }
    return true;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (submissionPending.current || submitSuccess || !validateForm()) return;
    submissionPending.current = true;
    setIsSubmitting(true);
    setSubmitSuccess('');
    setFormError('');
    try {
      await studentsApi.submitPublicRegistration({
        ...form,
        memorization: {
          fullJuzs: expandJuzRanges(memorizedRanges),
        },
      }, registrationNumber);
      toast({ title: 'تم إرسال الطلب بنجاح', description: 'سيتم التواصل معكم قريباً.' });
      setSubmitSuccess('تم إرسال الطلب بنجاح');
      setForm({ name: '', guardianPhone: '', nationalId: '', age: '', complexId: '', committeeId: '' });
      setMemorizedRanges([]);
      setRangeDraft(emptyDraft);
    } catch (error) {
      setFormError(error.message || 'تعذر إرسال الطلب.');
      toast({ title: 'تعذر إرسال الطلب', description: error.message, variant: 'destructive' });
    } finally {
      submissionPending.current = false;
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingScreen />;
  }
  const formCommittees = committees.filter(row => String(row.complexId) === form.complexId);

  return (
    <main className="relative min-h-screen bg-background px-3 py-5 text-foreground [font-family:var(--font-ui)] sm:px-5 sm:py-8" dir="rtl">
      <Helmet>
        <title>طلب التسجيل</title>
      </Helmet>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/[0.06] to-transparent" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center">
              <img src={resolveAssetUrl(site.logo)} alt={`شعار ${site.name}`} className="h-full w-full rounded-2xl object-contain" />
            </span>
            <div>
              <p className="text-lg font-black">{site.name}</p>
            </div>
          </div>
          <ThemeToggle className="h-11 w-11 border border-border bg-card shadow-sm" />
        </div>

        <Card>
          <CardContent className="space-y-6 p-4 sm:p-7">
            <div className="border-b border-border pb-5">
              <h1 className="text-2xl font-black leading-relaxed text-foreground sm:text-3xl">طلب التسجيل</h1>
            </div>

            {loadError ? (
              <ErrorState message={loadError} onRetry={() => setLoadAttempt((attempt) => attempt + 1)} />
            ) : !enabled ? (
              <div className="rounded-2xl border border-border bg-muted/45 p-7 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-card text-muted-foreground shadow-sm">
                  <LockKeyhole className="h-5 w-5" />
                </span>
                <p className="mt-4 text-lg font-black text-foreground">التسجيل مغلق حالياً</p>
                <p className="mt-1 text-sm font-semibold text-muted-foreground">يمكنك المحاولة مرة أخرى عند فتح باب التسجيل.</p>
              </div>
            ) : submitSuccess ? (
              <div role="status" className="space-y-4 py-12 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                <p className="text-xl font-black text-foreground">{submitSuccess}</p>
              </div>
            ) : (
              <form className="space-y-6" onSubmit={submit} noValidate>
                <div className="grid gap-4 md:grid-cols-2">
                  <LabeledField label="اسم الطالب">
                    <Input value={form.name} onChange={(event) => setFormField('name', event.target.value)} required />
                  </LabeledField>
                  <LabeledField label="رقم جوال ولي الأمر">
                    <Input
                      inputMode="numeric"
                      value={form.guardianPhone}
                      onChange={(event) => setFormField('guardianPhone', digitsOnly(event.target.value, 40))}
                      maxLength={40}
                    />
                  </LabeledField>
                  <LabeledField label="رقم الهوية">
                    <Input
                      inputMode="numeric"
                      value={form.nationalId}
                      onChange={(event) => setFormField('nationalId', digitsOnly(event.target.value, 40))}
                      maxLength={40}
                    />
                  </LabeledField>
                  <LabeledField label="العمر">
                    <Input
                      inputMode="numeric"
                      value={form.age}
                      onChange={(event) => setFormField('age', digitsOnly(event.target.value, 3))}
                      required
                    />
                  </LabeledField>
                  <LabeledField label="المجمع">
                    <Select value={form.complexId} onValueChange={value => setFormField('complexId', value)} disabled={!complexes.length}>
                      <SelectTrigger aria-label="المجمع"><SelectValue placeholder={complexes.length ? 'اختر المجمع' : 'لا توجد مجمعات متاحة'} /></SelectTrigger>
                      <SelectContent>{complexes.map(row => <SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </LabeledField>
                  <LabeledField label="الحلقة">
                    <Select value={form.committeeId} onValueChange={value => setFormField('committeeId', value)} disabled={!form.complexId || !formCommittees.length}>
                      <SelectTrigger aria-label="الحلقة"><SelectValue placeholder={!form.complexId ? 'اختر المجمع أولًا' : formCommittees.length ? 'اختر الحلقة' : 'لا توجد حلقات في هذا المجمع'} /></SelectTrigger>
                      <SelectContent>{formCommittees.map(row => <SelectItem key={row.id} value={String(row.id)}>{row.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </LabeledField>
                </div>

                <section className="space-y-4">
                  <div>
                    <h2 className="text-lg font-black text-foreground">ماهو محفوظك؟</h2>
                  </div>

                  <div className="grid gap-3 rounded-2xl border border-primary/15 bg-background/60 p-3 sm:grid-cols-[1fr_1fr_auto]">
                    <JuzSelect label="من الجزء" value={rangeDraft.startJuz} juzs={juzOptions} onChange={(value) => setDraftField('startJuz', value)} />
                    <JuzSelect label="إلى الجزء" value={rangeDraft.endJuz} juzs={juzOptions} onChange={(value) => setDraftField('endJuz', value)} />
                    <div className="flex items-end">
                      <Button type="button" variant="outline" className="h-11 w-full gap-2 sm:w-auto" onClick={addMemorizedRange}>
                        <Plus className="h-4 w-4" />
                        إضافة
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-primary/15 bg-background/70 p-4">
                    <div className="mb-3 text-sm font-black text-muted-foreground">ملخص المحفوظ</div>
                    {memorizedRanges.length ? (
                      <div className="flex flex-wrap gap-2">
                        {memorizedRanges.map((range, index) => (
                          <Tag
                            key={`${range.startJuz}-${range.endJuz}`}
                            label={formatJuzRange(range, numberText)}
                            onRemove={() => setMemorizedRanges((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm font-bold text-muted-foreground">لا يوجد محفوظ محدد.</div>
                    )}
                  </div>
                </section>

                {formError ? (
                  <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-black text-destructive">
                    {formError}
                  </div>
                ) : null}

                <Button type="submit" loading={isSubmitting} className="ms-auto flex h-12 w-full gap-2 sm:w-auto">
                  {!isSubmitting && <Send className="h-4 w-4" />}
                  إرسال الطلب
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </main>
  );
};

const JuzSelect = ({ label, value, juzs, onChange }) => (
  <LabeledField label={label}>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="bg-background">
        <SelectValue placeholder="اختر" />
      </SelectTrigger>
      <SelectContent>
        {juzs.map((juz) => (
          <SelectItem key={juz} value={String(juz)}>الجزء {numberText(juz)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </LabeledField>
);

const Tag = ({ label, onRemove }) => (
  <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">
    <CheckCircle2 className="h-4 w-4 shrink-0" />
    <span className="truncate">{label}</span>
    <button type="button" onClick={onRemove} className="-my-2 -ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-primary/15" aria-label="حذف">
      <X className="h-3.5 w-3.5" />
    </button>
  </span>
);

export default PublicRegistration;
