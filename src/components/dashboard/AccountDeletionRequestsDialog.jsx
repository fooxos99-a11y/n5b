import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { studentsApi } from '@/services/studentsApi';
import ConfirmAccountRemovalDialog from '@/components/account/ConfirmAccountRemovalDialog';

const roleLabels = {
  student: 'طالب',
  supervisor: 'معلم',
  admin: 'إداري',
  manager: 'مدير',
};

const formatDateTime = (value) => new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value));

const AccountDeletionRequestsDialog = ({ triggerClassName }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState(null);
  const [confirmRequest, setConfirmRequest] = useState(null);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const data = await studentsApi.getAccountDeletionRequests();
      setRequests((Array.isArray(data) ? data : []).filter(({ status }) => status === 'pending'));
    } catch (error) {
      toast({ title: 'تعذر تحميل طلبات الحذف', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (nextOpen) loadRequests();
  };

  const updateRequest = async (request, status) => {
    setActiveRequestId(request.id);
    try {
      await studentsApi.updateAccountDeletionRequest(request.id, { status });
      setConfirmRequest(null);
      setRequests((current) => current.filter(({ id }) => id !== request.id));
      toast({
        title: status === 'completed' ? 'تم حذف الحساب' : 'تم إلغاء طلب الحذف',
      });
    } catch (error) {
      toast({
        title: status === 'completed' ? 'تعذر حذف الحساب' : 'تعذر إلغاء الطلب',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setActiveRequestId(null);
    }
  };

  const _resolveAccountDeletionRequestsDialog = () => {
    if (isLoading) {
      return <DashboardLoader className="min-h-28" />;
    }
    if (requests.length) {
      return <div className="space-y-3">
              {requests.map((request) => {
                const isSaving = activeRequestId === request.id;
                return (
                  <div key={request.id} className="flex items-center gap-3 rounded-xl border border-primary/15 bg-background/50 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-foreground">{request.userName}</p>
                      <p className="mt-1 text-xs font-bold text-muted-foreground">
                        {roleLabels[request.userRole] || request.userRole} · {formatDateTime(request.requestedAt)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      disabled={Boolean(activeRequestId)}
                      loading={isSaving}
                      onClick={() => setConfirmRequest(request)}
                      aria-label={`حذف حساب ${request.userName}`}
                      title="حذف الحساب"
                    >
                      {!isSaving && <Trash2 className="h-4 w-4" />}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={Boolean(activeRequestId)}
                      onClick={() => updateRequest(request, 'rejected')}
                      aria-label={`إلغاء طلب حذف ${request.userName}`}
                      title="إلغاء الطلب"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>;
    }
    return <p className="rounded-xl border border-dashed border-primary/20 p-5 text-center text-sm font-bold text-muted-foreground">
              لا توجد طلبات حذف معلقة.
            </p>;
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={cn('min-h-11 w-full justify-center gap-2', triggerClassName)}
        onClick={() => handleOpenChange(true)}
      >
        <Trash2 className="h-4 w-4" />
        طلبات الحذف
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto border-primary/25 bg-card [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary">طلبات الحذف</DialogTitle>
          </DialogHeader>

          {_resolveAccountDeletionRequestsDialog()}
        </DialogContent>
      </Dialog>
      <ConfirmAccountRemovalDialog request={confirmRequest} busy={Boolean(activeRequestId)} onClose={() => setConfirmRequest(null)} onConfirm={request => updateRequest(request, 'completed')} />
    </>
  );
};

export default AccountDeletionRequestsDialog;
