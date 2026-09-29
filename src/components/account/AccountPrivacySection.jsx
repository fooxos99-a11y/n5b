import React, { useEffect, useState } from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

const statusLabels = {
  pending: 'قيد المراجعة',
  cancelled: 'ملغي',
  completed: 'تمت المعالجة',
  rejected: 'مرفوض',
};

const formatDateTime = (value) => (
  value
    ? new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : ''
);

const AccountPrivacySection = ({ compact = false, allowDeletion = true, embeddedConfirmation = false, onClose }) => {
  const { toast } = useToast();
  const [request, setRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(allowDeletion);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    setRequest(await studentsApi.getMyAccountDeletionRequest());
  };

  useEffect(() => {
    if (!allowDeletion) {
      setIsLoading(false);
      return undefined;
    }
    load()
      .catch((error) => toast({ title: 'تعذر تحميل بيانات الخصوصية', description: error.message, variant: 'destructive' }))
      .finally(() => setIsLoading(false));
    return undefined;
  }, [allowDeletion, toast]);

  const createRequest = async () => {
    setIsSaving(true);
    try {
      await studentsApi.requestAccountDeletion();
      await load();
      setConfirmOpen(false);
      toast({ title: 'تم إرسال طلب حذف الحساب' });
      onClose?.();
    } catch (error) {
      toast({ title: 'تعذر إرسال الطلب', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelRequest = async () => {
    setIsSaving(true);
    try {
      await studentsApi.cancelAccountDeletion();
      await load();
      toast({ title: 'تم إلغاء طلب الحذف' });
    } catch (error) {
      toast({ title: 'تعذر إلغاء الطلب', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && (!compact || embeddedConfirmation)) return <DashboardLoader className={embeddedConfirmation ? 'min-h-32' : 'min-h-[360px]'} />;

  const isPending = request?.status === 'pending';
  const _resolveActions = () => {
    if (isPending) {
      return <Button
          type="button"
          variant={compact ? 'link' : 'outline'}
          className={compact
            ? 'min-h-11 w-full px-2 py-1 text-xs font-bold text-muted-foreground underline-offset-4 hover:text-destructive hover:underline'
            : 'min-h-11 gap-2 rounded-xl'}
          onClick={cancelRequest}
          loading={isSaving}
        >
          إلغاء طلب الحذف
        </Button>;
    }
    if (compact) {
      return <Button
          type="button"
          variant="link"
          className="min-h-11 w-full px-2 py-1 text-xs font-bold text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
          onClick={() => setConfirmOpen(true)}
        >
          طلب حذف الحساب
        </Button>;
    }
    return <Button variant="destructive" className="min-h-11 w-full justify-center gap-2 rounded-xl" onClick={() => setConfirmOpen(true)}>
          <Trash2 className="h-4 w-4" /> طلب حذف الحساب
        </Button>;
  };
  const actions = (
    <>
      {request && !compact && (
        <div className="flex justify-end">
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-black text-primary">
            {statusLabels[request.status] || request.status}
          </span>
        </div>
      )}

      {request && !compact ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <p className="text-xs font-bold text-muted-foreground">{formatDateTime(request.updatedAt || request.requestedAt)}</p>
          {request.managerNote ? <p className="mt-3 text-sm font-semibold text-muted-foreground">{request.managerNote}</p> : null}
        </div>
      ) : null}

      {allowDeletion && embeddedConfirmation && !isPending ? (
        <DialogFooter className="grid grid-cols-2 gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>إلغاء</Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={createRequest} loading={isSaving}>تأكيد</Button>
          </DialogFooter>
      ) : allowDeletion && (_resolveActions())}
    </>
  );

  return (
    <div className={compact ? 'mt-1' : 'space-y-4'} dir="rtl">
      {compact ? (
        <div className="space-y-1">{actions}</div>
      ) : (
        <Card className="border-primary/25 bg-card">
          <CardHeader className="border-b border-primary/15 p-4">
            <div className="flex items-center gap-2 text-lg font-black text-primary">
              <ShieldCheck className="h-5 w-5" /> الحساب والخصوصية
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">{actions}</CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="border-primary/25 bg-card" dir="rtl">
          <DialogHeader><DialogTitle>تأكيد طلب حذف الحساب</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>تراجع</Button>
            <Button variant="destructive" onClick={createRequest} loading={isSaving}>إرسال الطلب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AccountPrivacySection;
