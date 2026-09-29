import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

export default function LoginHelpDialog({ open, onOpenChange }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" aria-describedby={undefined} className="max-w-sm p-6 [font-family:var(--font-ui)]">
      <DialogTitle className="text-center leading-relaxed">الرجاء التواصل مع الإدارة.</DialogTitle>
      <Button type="button" onClick={() => onOpenChange(false)}>إغلاق</Button>
    </DialogContent>
  </Dialog>;
}
