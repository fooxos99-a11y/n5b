import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { studentsApi } from '@/services/studentsApi';

const CONFIRM_TEXT = 'إعادة تعيين النقاط';

const ResetPointsDialog = () => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handleOpenChange = (nextOpen) => {
    if (isResetting) return;
    setOpen(nextOpen);
    if (!nextOpen) setConfirmText('');
  };

  const resetPoints = async () => {
    setIsResetting(true);
    try {
      const result = await studentsApi.resetAllPoints(confirmText);
      toast({ title: result.message || 'تمت إعادة تعيين النقاط.' });
      setOpen(false);
      setConfirmText('');
    } catch (error) {
      toast({
        title: 'تعذرت إعادة تعيين النقاط',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="h-4 w-4" />
        إعادة تعيين النقاط
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md border-destructive/30 bg-card [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-destructive">تأكيد إعادة تعيين النقاط</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-bold leading-7 text-muted-foreground">
              سيُصفّر رصيد نقاط جميع الطلاب والحلقات وأرصدة المتجر وسجل الإضافة والخصم، مع إبقاء الحضور والتسميع والخطط وبقية البيانات. اكتب «{CONFIRM_TEXT}» للتأكيد.
            </p>
            <Input
              aria-label="تأكيد إعادة تعيين النقاط"
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              placeholder={CONFIRM_TEXT}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isResetting}>
              إلغاء
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={isResetting}
              disabled={confirmText.trim() !== CONFIRM_TEXT}
              onClick={resetPoints}
            >
              إعادة التعيين
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ResetPointsDialog;
