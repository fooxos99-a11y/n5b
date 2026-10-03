import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { FileImage, MessageCircle, QrCode, RefreshCw, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import MessageComposer from '@/components/dashboard/MessageComposer';
import MessageRecipientsList from '@/components/dashboard/MessageRecipientsList';
import MessageRecipientFilters from '@/components/dashboard/MessageRecipientFilters';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { ManagementPanel, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { studentsApi } from '@/services/studentsApi';

const allowedAttachmentTypes = new Set([
  'application/pdf',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const failedWhatsAppStatuses = new Set(['auth_failure', 'disconnected', 'error']);

const formatPhone = (phone = '') => {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return 'بدون رقم';
  if (digits.startsWith('966')) return `+${digits}`;
  if (digits.startsWith('0')) return digits;
  return digits;
};

const WhatsAppSendSection = () => {
  const { toast } = useToast();
  const [families, setFamilies] = useState([]);
  const [students, setStudents] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [recipientType, setRecipientType] = useState('students');
  const [familyId, setFamilyId] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [sendSummary, setSendSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const statusRequestRef = useRef(false);

  useEffect(() => {
    studentsApi.getCommittees().then(setFamilies).catch((error) => {
      toast({ title: 'تعذر تحميل الحلقات', description: error.message, variant: 'destructive' });
    });
    studentsApi.getSupervisors().then(setSupervisors).catch((error) => {
      toast({ title: 'تعذر تحميل مشرفي المسارات', description: error.message, variant: 'destructive' });
    });
  }, [toast]);

  useEffect(() => {
    let cancelled = false;

    const loadStudents = async () => {
      if (recipientType === 'supervisors') {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const data = await studentsApi.getStudents({ committeeId: familyId });
        if (!cancelled) {
          setStudents(data);

        }
      } catch (error) {
        if (!cancelled) {
          toast({ title: 'تعذر تحميل الطلاب', description: error.message, variant: 'destructive' });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    const timeout = setTimeout(loadStudents, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [familyId, recipientType, toast]);

  const visibleRecipients = useMemo(() => {
    if (recipientType !== 'supervisors') return students;
    return supervisors;
  }, [recipientType, students, supervisors]);

  const filteredIds = useMemo(() => visibleRecipients.map((recipient) => Number(recipient.id)), [visibleRecipients]);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !filteredIds.includes(id)));
      return;
    }

    setSelectedIds((current) => Array.from(new Set([...current, ...filteredIds])));
  };

  const toggleRecipient = (recipientId) => {
    const id = Number(recipientId);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const updateRecipientType = (value) => {
    setRecipientType(value);
    setSelectedIds([]);
  };

  const updateAttachment = (file) => {
    if (!file) {
      setAttachment(null);
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast({ title: 'الملف كبير', description: 'الحد الأعلى للمرفق 12 ميجابايت.', variant: 'destructive' });
      return;
    }
    if (!allowedAttachmentTypes.has(String(file.type || '').toLowerCase())) {
      toast({ title: 'نوع الملف غير مدعوم', description: 'المسموح PDF وJPG وPNG وWEBP وGIF وHEIC فقط.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({
        name: file.name,
        type: file.type || 'application/octet-stream',
        data: (typeof reader.result === 'string' ? reader.result : ''),
      });
    };
    reader.readAsDataURL(file);
  };

  const sendMessages = async () => {
    setIsSending(true);
    setSendSummary(null);
    try {
      const result = await studentsApi.sendWhatsAppMessages({
        recipientType,
        studentIds: recipientType !== 'supervisors' ? selectedIds : [],
        supervisorIds: recipientType === 'supervisors' ? selectedIds : [],
        message,
        attachment,
      });
      setSendSummary(result);
      if (result.failedCount > 0) {
        toast({
          title: 'اكتمل الإرسال جزئياً',
          description: `تم تأكيد وصول ${result.sentCount} وتعذر ${result.failedCount}.`,
          variant: 'destructive',
        });
      } else {
        toast({ title: `تم تأكيد وصول ${result.sentCount} رسالة` });
      }
    } catch (error) {
      const result = error.data || {
        sentCount: 0,
        failedCount: selectedIds.length,
        failed: [{ reason: error.message }],
      };
      setSendSummary(result);
      const reason = result.failed?.[0]?.reason || error.message;
      toast({ title: 'تعذر الإرسال', description: reason, variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  const loadWhatsAppStatus = useCallback(async () => {
    if (statusRequestRef.current) return;
    statusRequestRef.current = true;
    try {
      const status = await studentsApi.getWhatsAppStatus();
      setWhatsAppStatus((current) => {
        if (current?.ready && !status.ready && (status.status === 'starting' || status.status === 'qr')) {
          return { ...current, status: 'checking' };
        }
        return status;
      });
    } catch (error) {
      setWhatsAppStatus({
        ready: false,
        qr: '',
        status: 'error',
        message: error.message || 'تعذر تجهيز باركود واتساب.',
      });
      toast({ title: 'تعذر تحميل باركود واتساب', description: error.message, variant: 'destructive' });
    } finally {
      statusRequestRef.current = false;
    }
  }, [toast]);

  const disconnectWhatsApp = async () => {
    setIsDisconnecting(true);
    try {
      setWhatsAppStatus(await studentsApi.disconnectWhatsApp());
      toast({ title: 'تم إلغاء ربط واتساب' });
    } catch (error) {
      toast({ title: 'تعذر إلغاء الربط', description: error.message, variant: 'destructive' });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const resetWhatsAppBarcode = async () => {
    setIsDisconnecting(true);
    try {
      await studentsApi.disconnectWhatsApp();
      setWhatsAppStatus({
        ready: false,
        qr: '',
        status: 'starting',
        message: 'جاري إنشاء باركود واتساب جديد...',
      });
      await loadWhatsAppStatus();
    } catch (error) {
      setWhatsAppStatus({ ready: false, qr: '', status: 'error', message: error.message });
      toast({ title: 'تعذر إنشاء باركود جديد', description: error.message, variant: 'destructive' });
    } finally {
      setIsDisconnecting(false);
    }
  };

  useEffect(() => {
    if (!qrOpen) return undefined;
    loadWhatsAppStatus();
    if (whatsAppStatus?.ready || failedWhatsAppStatuses.has(whatsAppStatus?.status)) return undefined;
    const timer = setInterval(loadWhatsAppStatus, 1500);
    return () => clearInterval(timer);
  }, [loadWhatsAppStatus, qrOpen, whatsAppStatus?.ready, whatsAppStatus?.status]);

  const _resolveWhatsAppSendSection = () => {
    if (whatsAppStatus?.ready) {
      return <div className="rounded-xl bg-emerald-500/10 px-5 py-4 text-center font-bold text-emerald-700 dark:text-emerald-300">
                واتساب متصل وجاهز للإرسال
              </div>;
    }
    if (whatsAppStatus?.qr && whatsAppStatus.status === 'qr') {
      return <img src={whatsAppStatus.qr} alt="WhatsApp QR" className="h-64 w-64 rounded-2xl bg-white p-3" />;
    }
    if (failedWhatsAppStatuses.has(whatsAppStatus?.status)) {
      return <div className="grid place-items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 px-5 py-6 text-center">
                <p className="text-sm font-bold leading-6 text-destructive">
                  {whatsAppStatus?.message || 'تعذر تجهيز باركود واتساب.'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 gap-2 rounded-2xl"
                  onClick={resetWhatsAppBarcode}
                  loading={isDisconnecting}
                >
                  <RefreshCw className="h-4 w-4" />
                  إنشاء باركود جديد
                </Button>
              </div>;
    }
    return <div className="grid place-items-center gap-3 py-10 text-center">
                <DashboardLoader />
                <p className="text-sm font-bold text-muted-foreground">
                  {whatsAppStatus?.message || 'جاري تجهيز باركود واتساب...'}
                </p>
              </div>;
  };
  return (
    <div className="space-y-4 [font-family:var(--font-ui)]" dir="rtl">
      <ManagementPanel>
        <ManagementToolbar>
          <MessageRecipientFilters
            recipientType={recipientType}
            onRecipientTypeChange={updateRecipientType}
            roles={[{ value: 'students', label: 'الطلاب' }, { value: 'guardians', label: 'أولياء الأمور' }, { value: 'supervisors', label: 'مشرفي المسارات' }]}
            committeeId={familyId}
            onCommitteeChange={setFamilyId}
            committees={families}
            showCommittees={recipientType !== 'supervisors'}
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setQrOpen(true)}
              className="h-11 w-11 shrink-0 overflow-hidden text-[0px] [&_svg]:h-4 [&_svg]:w-4"
              title="باركود واتساب"
              aria-label="باركود واتساب"
            >
              <QrCode className="h-4 w-4" />
            </Button>
          </MessageRecipientFilters>
        </ManagementToolbar>

        <div className="divide-y divide-border">
          <div className="p-4 sm:p-6">
            <MessageComposer value={message} onChange={setMessage} onSend={() => setConfirmSend(true)} sending={isSending} disabled={selectedIds.length === 0 || !message.trim()} placeholder="اكتب الرسالة هنا... يمكنك استخدام {name} لاسم الطالب." actions={<>
                <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-bold text-foreground transition hover:bg-white dark:bg-card dark:hover:bg-card focus-within:ring-2 focus-within:ring-ring">
                  <FileImage className="h-4 w-4 text-primary" />
                  إرفاق ملف
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                    className="hidden"
                    onChange={(event) => updateAttachment(event.target.files?.[0])}
                  />
                </label>
                {attachment ? (
                  <div className="flex min-w-0 items-center gap-2 rounded-xl bg-primary/10 ps-3 text-sm font-bold text-primary">
                    <span className="max-w-[220px] truncate">{attachment.name}</span>
                    <button type="button" className="min-h-11 px-2 text-muted-foreground hover:text-destructive" onClick={() => setAttachment(null)}>
                      حذف
                    </button>
                  </div>
                ) : null}
              </>}>

              {sendSummary ? (
                <div className={`rounded-xl border p-3 text-sm ${
                  sendSummary.failedCount > 0
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                }`}>
                  <p className="font-bold">
                    تم تأكيد وصول {sendSummary.sentCount || 0} رسالة
                    {sendSummary.failedCount > 0 ? `، وتعذر إرسال ${sendSummary.failedCount}` : ''}
                  </p>
                  {(sendSummary.failed || []).map((item, index) => (
                    <p key={`${item.id || item.name || 'failure'}-${index}`} className="mt-1">
                      {item.name ? `${item.name}: ` : ''}{item.reason}
                    </p>
                  ))}
                </div>
              ) : null}
            </MessageComposer>
          </div>

          <div className="p-4 sm:p-6">
            <MessageRecipientsList
              recipients={visibleRecipients} selectedCount={selectedIds.length} allSelected={allSelected}
              onToggleAll={toggleAll} onToggle={(recipient) => toggleRecipient(recipient.id)}
              isSelected={(recipient) => selectedIds.includes(Number(recipient.id))} getKey={(recipient) => recipient.id} loading={isLoading}
              renderDetails={(recipient) => <div className="mt-1 flex flex-wrap gap-2 text-sm text-muted-foreground"><span className="text-primary">{formatPhone(recipientType === 'guardians' ? recipient.guardianPhone : recipient.phone)}</span>{recipientType === 'supervisors' && recipient.jobTitle ? <span>{recipient.jobTitle}</span> : null}</div>}
              renderBadge={() => <>{recipientType !== 'supervisors' ? <MessageCircle className="h-5 w-5" /> : <Users className="h-5 w-5" />}<span>{recipientType === 'guardians' ? 'ولي الأمر' : recipientType === 'students' ? 'الطالب' : 'مشرف المسار'}</span></>}
            />
          </div>
        </div>
      </ManagementPanel>

      <Dialog open={confirmSend} onOpenChange={setConfirmSend}>
        <DialogContent dir="rtl" className="[font-family:var(--font-ui)]">
          <DialogHeader><DialogTitle>تأكيد إرسال واتساب</DialogTitle></DialogHeader>
          <p>إرسال الرسالة إلى {selectedIds.length} مستلمًا، بما في ذلك المحددون خارج الفلتر الحالي.</p>
          <p className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{message}</p>
          {attachment && <p>{attachment.name}</p>}
          <DialogFooter><Button variant="outline" onClick={() => setConfirmSend(false)}>إلغاء</Button><Button disabled={isSending} onClick={() => { setConfirmSend(false); void sendMessages(); }}>إرسال</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-md bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-black text-primary">ربط واتساب</DialogTitle>
          </DialogHeader>
          <div className="grid place-items-center gap-4 py-4">
            {_resolveWhatsAppSendSection()}
          </div>
          <DialogFooter className="gap-3 sm:justify-center">
            <Button variant="outline" className="h-11 px-8" onClick={() => setQrOpen(false)}>إغلاق</Button>
            {whatsAppStatus?.ready && (
              <Button variant="destructive" className="h-11 px-8" onClick={disconnectWhatsApp} loading={isDisconnecting}>
                إلغاء الربط
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WhatsAppSendSection;
