import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function ConfirmAccountRemovalDialog({ request, busy, onClose, onConfirm }) {
  return <Dialog open={Boolean(request)} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent dir="rtl" className="[font-family:var(--font-ui)]" aria-describedby="account-removal-consequence">
      <DialogHeader><DialogTitle>حذف حساب {request?.userName}؟</DialogTitle></DialogHeader>
      <p id="account-removal-consequence">سيُحذف الحساب ودرجاته وخططه نهائيًا. لا يمكن التراجع.</p>
      <DialogFooter>
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>إلغاء</Button>
        <Button variant="destructive" className="min-h-11" disabled={busy} loading={busy} onClick={() => onConfirm(request)}>حذف الحساب نهائيًا</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
