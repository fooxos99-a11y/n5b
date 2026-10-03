import ErrorState from '@/components/ui/error-state';
import React, { useEffect, useState } from 'react';
import { getSiteConfig } from '@/site/siteConfigs';
import { Capacitor } from '@capacitor/core';
import { getTenantRegistrationNumber } from '@/services/apiBase';
import { buildRegistrationLink } from '../../../shared/registration-link';
import { formatHijriDate } from '../../../shared/hijri-calendar';
import { Check, CheckCircle2, Clipboard, Copy, X, XCircle } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import PasswordInput from '@/components/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { FormField, FormGrid, ManagementEmpty, ManagementList, ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { formatJuzNumbers } from '@/lib/juzRanges';
import { studentsApi } from '@/services/studentsApi';

const emptyAcceptForm = {
  name: '',
  loginNumber: '',
  password: '',
  guardianPhone: '',
  nationalId: '',
  age: '',
  complexId: '',
  committeeId: '',
};

const numberText = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');
const formatSubmissionDate = (value) => {
  const datePart = String(value || '').slice(0, 10);
  return formatHijriDate(datePart, { month: 'long' }) || '-';
};

const RegistrationRequestsSection = () => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [requests, setRequests] = useState([]);
  const [committees, setCommittees] = useState([]);
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  const [activeRequest, setActiveRequest] = useState(null);
  const [pendingRejection, setPendingRejection] = useState(null);
  const [acceptForm, setAcceptForm] = useState(emptyAcceptForm);
  const [testResults, setTestResults] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const complexes = [...new Map(committees.filter(row => row.complexId).map(row => [String(row.complexId), { id: String(row.complexId), name: row.complexName }])).values()];
  const formCommittees = committees.filter(row => String(row.complexId || '') === acceptForm.complexId);

  const registrationLink = buildRegistrationLink({
    origin: window.location.origin,
    basePath: import.meta.env.BASE_URL,
    publicUrl: getSiteConfig().publicUrl,
    native: Capacitor.isNativePlatform(),
    registrationNumber: getTenantRegistrationNumber(),
  });

  const loadData = async () => {
    const [requestData, committeeData] = await Promise.all([
      studentsApi.getRegistrationRequests(),
      studentsApi.getCommittees(),
    ]);
    setLoadError('');
    setRequests(requestData.requests || []);
    setRegistrationEnabled(Boolean(requestData.registrationEnabled));
    setCommittees(committeeData || []);
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([
      studentsApi.getRegistrationRequests(),
      studentsApi.getCommittees(),
    ])
      .then(([requestData, committeeData]) => {
        if (!mounted) return;
        setLoadError('');
    setRequests(requestData.requests || []);
        setRegistrationEnabled(Boolean(requestData.registrationEnabled));
        setCommittees(committeeData || []);
      })
      .catch((error) => {
        if (!mounted) return;
        setLoadError(error.message || 'تعذر تحميل طلبات التسجيل.');
        toast({ title: 'تعذر تحميل طلبات التسجيل', description: error.message, variant: 'destructive' });
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [toast]);

  const updateConfig = async () => {
    const next = !registrationEnabled;
    setBusyKey('config');
    try {
      const result = await studentsApi.updateRegistrationConfig({ registrationEnabled: next });
      setRegistrationEnabled(Boolean(result.registrationEnabled));
      toast({ title: next ? 'تم فتح التسجيل' : 'تم إغلاق التسجيل' });
    } catch (error) {
      toast({ title: 'تعذر تعديل حالة التسجيل', description: error.message, variant: 'destructive' });
    } finally {
      setBusyKey('');
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(registrationLink);
      toast({ title: 'تم نسخ رابط التسجيل' });
    } catch {
      toast({ title: 'تعذر نسخ الرابط', description: registrationLink, variant: 'destructive' });
    }
  };

  const openAcceptDialog = (request) => {
    setActiveRequest(request);
    setAcceptForm({
      name: request.name || '',
      loginNumber: request.nationalId || '',
      password: '',
      guardianPhone: request.guardianPhone || '',
      nationalId: request.nationalId || '',
      age: request.age ? String(request.age) : '',
      complexId: request.complexId ? String(request.complexId) : '',
      committeeId: request.committeeId ? String(request.committeeId) : '',
    });
    setTestResults(request.testResults || {});
  };

  const preliminaryAccept = async (request) => {
    setBusyKey(`pre-${request.id}`);
    try {
      await studentsApi.preliminaryAcceptRegistrationRequest(request.id);
      toast({ title: 'حُفظ القبول المبدئي' });
      await loadData();
    } catch (error) {
      const linkedDeviceOffline = error.data?.code === 'WHATSAPP_LINKED_DEVICE_OFFLINE';
      toast({
        title: linkedDeviceOffline ? 'جهاز واتساب غير متصل بالإنترنت' : 'تعذر إرسال القبول المبدئي',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setBusyKey('');
    }
  };

  const rejectRequest = async () => {
    const request = pendingRejection;
    if (!request) return;
    setBusyKey(`reject-${request.id}`);
    try {
      await studentsApi.rejectRegistrationRequest(request.id);
      toast({ title: 'تم رفض الطلب وحذفه' });
      await loadData();
    } catch (error) {
      toast({ title: 'تعذر رفض الطلب', description: error.message, variant: 'destructive' });
    } finally {
      setBusyKey('');
      setPendingRejection(null);
    }
  };

  const acceptRequest = async () => {
    if (!activeRequest) return;
    setBusyKey(`accept-${activeRequest.id}`);
    try {
      await studentsApi.acceptRegistrationRequest(activeRequest.id, {
        ...acceptForm,
        testResults,
      });
      toast({ title: 'تم قبول الطالب وإضافته' });
      setActiveRequest(null);
      await loadData();
    } catch (error) {
      toast({ title: 'تعذر قبول الطالب', description: error.message, variant: 'destructive' });
    } finally {
      setBusyKey('');
    }
  };

  const memorizationItems = activeRequest?.memorization?.items || [];
  const allResultsComplete = memorizationItems.every((item) => ['passed', 'failed'].includes(testResults[item.id]));
  const canAccept = acceptForm.name.trim()
    && acceptForm.loginNumber.trim()
    && acceptForm.password
    && acceptForm.complexId
    && formCommittees.some(row => String(row.id) === acceptForm.committeeId)
    && allResultsComplete;

  if (loadError) return <ErrorState message={loadError} onRetry={() => loadData().catch(error => setLoadError(error.message))} />;
  if (isLoading) {
    return <DashboardLoader className="min-h-[420px]" />;
  }

  const _resolveRegistrationRequestsSection = () => {
    if (busyKey === 'config') {
      return <LoadingSpinner />;
    }
    if (registrationEnabled) {
      return <CheckCircle2 className="h-4 w-4" />;
    }
    return <XCircle className="h-4 w-4" />;
  };
  return (
    <ManagementPanel>
      <ManagementToolbar>
        <Button
          type="button"
          variant="outline"
          onClick={updateConfig}
          disabled={busyKey === 'config'}
          className={`h-11 gap-2 text-white ${
            registrationEnabled
              ? 'border-emerald-600 bg-emerald-600 hover:border-emerald-700 hover:bg-emerald-700 hover:text-white'
              : 'border-red-600 bg-red-600 hover:border-red-700 hover:bg-red-700 hover:text-white'
          }`}
        >
          {_resolveRegistrationRequestsSection()}
          {registrationEnabled ? 'التسجيل مفتوح' : 'التسجيل مغلق'}
        </Button>
        <Button type="button" variant="outline" onClick={copyLink} className="h-11 gap-2">
          <Copy className="h-4 w-4" /> نسخ الرابط
        </Button>
      </ManagementToolbar>

      {requests.length ? (
        <ManagementList label="طلبات التسجيل">
          {requests.map((request) => (
            <li key={request.id} className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate text-base font-bold text-foreground">{request.name}</div>
                {request.preliminarySentAt && <p className="text-xs text-muted-foreground">سُجل القبول المبدئي: {formatSubmissionDate(request.preliminarySentAt)}</p>}
                <div className="flex flex-wrap items-start gap-x-5 gap-y-1 text-sm">
                  <RequestDetail label="العمر" value={`${numberText(request.age)} سنة`} />
                  <RequestDetail label="تاريخ التقديم" value={formatSubmissionDate(request.createdAt)} />
                  {request.complexName && <RequestDetail label="المجمع" value={request.complexName} />}
                  {request.committeeName && <RequestDetail label="الحلقة" value={request.committeeName} />}
                  <RequestDetail label="المحفوظ" value={formatJuzNumbers(request.memorization?.juzs || [], numberText) || 'لا يوجد محفوظ سابق'} wide />
                </div>
              </div>

              <div className="grid shrink-0 grid-cols-3 gap-2">
                <Button type="button" variant="outline" onClick={() => preliminaryAccept(request)} disabled={busyKey === `pre-${request.id}`} className="h-11 whitespace-nowrap px-3 text-xs font-bold" aria-label={`قبول مبدئي لطلب ${request.name}`}>
                  {busyKey === `pre-${request.id}` ? <LoadingSpinner size="xs" /> : 'قبول مبدئي'}
                </Button>
                <Button type="button" onClick={() => openAcceptDialog(request)} className="h-11 whitespace-nowrap px-3 text-xs font-bold shadow-none" aria-label={`قبول نهائي لطلب ${request.name}`}>
                  قبول نهائي
                </Button>
                <Button type="button" variant="outline" onClick={() => setPendingRejection(request)} disabled={busyKey === `reject-${request.id}`} className="h-11 whitespace-nowrap px-3 text-xs font-bold text-destructive hover:bg-destructive/[0.06] hover:text-destructive" aria-label={`رفض طلب ${request.name}`}>
                  {busyKey === `reject-${request.id}` ? <LoadingSpinner size="xs" /> : 'رفض'}
                </Button>
              </div>
            </li>
          ))}
        </ManagementList>
      ) : (
        <ManagementEmpty>لا توجد طلبات تسجيل حالياً.</ManagementEmpty>
      )}

      <Dialog open={Boolean(activeRequest)} onOpenChange={(open) => !open && setActiveRequest(null)}>
        <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary">قبول طلب التسجيل</DialogTitle>
          </DialogHeader>

          <FormGrid>
            <FormField label="اسم الطالب" htmlFor="registration-accept-name">
              <Input id="registration-accept-name" value={acceptForm.name} onChange={(event) => setAcceptForm({ ...acceptForm, name: event.target.value })} />
            </FormField>
            <FormField label="المجمع" htmlFor="registration-accept-complex">
              <Select value={acceptForm.complexId} onValueChange={complexId => setAcceptForm({ ...acceptForm, complexId, committeeId: '' })}>
                <SelectTrigger id="registration-accept-complex" aria-label="المجمع"><SelectValue placeholder="اختر المجمع" /></SelectTrigger>
                <SelectContent>{complexes.map(row => <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label="الحلقة" htmlFor="registration-accept-committee">
              <Select disabled={!acceptForm.complexId || !formCommittees.length} value={acceptForm.committeeId} onValueChange={(value) => setAcceptForm({ ...acceptForm, committeeId: value })}>
                <SelectTrigger id="registration-accept-committee" aria-label="الحلقة" className="h-11">
                  <SelectValue placeholder="اختر الحلقة" />
                </SelectTrigger>
                <SelectContent>
                  {formCommittees.map((committee) => (
                    <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="رقم الجوال" htmlFor="registration-accept-phone">
              <Input id="registration-accept-phone" inputMode="tel" value={acceptForm.guardianPhone} onChange={(event) => setAcceptForm({ ...acceptForm, guardianPhone: event.target.value })} />
            </FormField>
            <FormField label="رقم الهوية" htmlFor="registration-accept-national-id">
              <Input id="registration-accept-national-id" value={acceptForm.nationalId} onChange={(event) => setAcceptForm({ ...acceptForm, nationalId: event.target.value })} />
            </FormField>
            <FormField label="العمر" htmlFor="registration-accept-age">
              <Input id="registration-accept-age" value={acceptForm.age} onChange={(event) => setAcceptForm({ ...acceptForm, age: event.target.value })} />
            </FormField>
            <FormField label="رقم الدخول" htmlFor="registration-accept-login-number">
              <Input id="registration-accept-login-number" value={acceptForm.loginNumber} onChange={(event) => setAcceptForm({ ...acceptForm, loginNumber: event.target.value })} />
            </FormField>
            <FormField label="كلمة المرور" htmlFor="registration-accept-password">
              <PasswordInput id="registration-accept-password" required autoComplete="new-password" value={acceptForm.password} onChange={(event) => setAcceptForm({ ...acceptForm, password: event.target.value })} />
            </FormField>
          </FormGrid>

          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center gap-2 text-sm font-black text-primary">
              <Clipboard className="h-4 w-4" />
              اختبار المحفوظ
            </div>
            {memorizationItems.length ? (
              <div className="divide-y divide-border">
                {memorizationItems.map((item) => (
                  <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div className="min-w-0">
                      <div className="font-black text-foreground">{item.label}</div>
                      <div className="text-xs font-bold text-muted-foreground">{item.type === 'juz' ? 'جزء كامل' : 'نطاق جزئي'}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <ResultButton
                        active={testResults[item.id] === 'passed'}
                        icon={Check}
                        label="ناجح"
                        onClick={() => setTestResults({ ...testResults, [item.id]: 'passed' })}
                      />
                      <ResultButton
                        active={testResults[item.id] === 'failed'}
                        icon={X}
                        label="راسب"
                        danger
                        onClick={() => setTestResults({ ...testResults, [item.id]: 'failed' })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-3 text-sm text-muted-foreground">
                الطالب لم يحدد محفوظاً سابقاً.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setActiveRequest(null)}>
              إغلاق
            </Button>
            {activeRequest ? (
              <Button type="button" variant="outline" onClick={() => preliminaryAccept(activeRequest)} disabled={busyKey === `pre-${activeRequest.id}`}>
                {busyKey === `pre-${activeRequest.id}` ? <LoadingSpinner /> : 'قبول مبدئي'}
              </Button>
            ) : null}
            <Button type="button" onClick={acceptRequest} disabled={!canAccept || busyKey === `accept-${activeRequest?.id}`}>
              {busyKey === `accept-${activeRequest?.id}` ? <LoadingSpinner /> : 'قبول نهائي'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingRejection)} onOpenChange={(open) => !open && setPendingRejection(null)}>
        <DialogContent className="max-w-md bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد رفض الطلب</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-bold leading-7 text-muted-foreground">
            سيُرفض طلب {pendingRejection?.name || 'الطالب'} ويُحذف نهائيًا.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingRejection(null)}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={rejectRequest}
              disabled={!pendingRejection || busyKey === `reject-${pendingRejection?.id}`}
            >
              {busyKey === `reject-${pendingRejection?.id}` ? <LoadingSpinner /> : 'رفض الطلب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagementPanel>
  );
};

const RequestDetail = ({ label, value, wide = false }) => (
  <div className={wide ? 'min-w-[15rem] flex-1' : ''}>
    <span className="font-bold text-muted-foreground">{label}: </span>
    <span className="font-black text-foreground">{value}</span>
  </div>
);

const ResultButton = ({ active, label, icon: Icon, danger = false, onClick }) => { const _resolveClassName = () => {
                                                                                     if (active) {
                                                                                       if (danger) {
                                                                                         return 'border-destructive bg-destructive text-destructive-foreground';
                                                                                       }
                                                                                       return 'border-emerald-600 bg-emerald-600 text-white';
                                                                                     }
                                                                                     return 'border-border bg-background text-foreground hover:bg-muted';
                                                                                   };
                                                                                   return (<button
    type="button"
    onClick={onClick}
    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-black transition ${
      _resolveClassName()
    }`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>); };

export default RegistrationRequestsSection;
