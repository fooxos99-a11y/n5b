import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Link } from '@/lib/router';

export default function LoginHelpDialog({ open, onOpenChange }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent dir="rtl" className="max-w-sm p-6 [font-family:var(--font-ui)]">
      <DialogTitle className="text-center leading-relaxed">استعادة الدخول</DialogTitle>
      <DialogDescription>لتعيين كلمة مرور جديدة، تواصل مع الإدارة.</DialogDescription>
      <Button asChild variant="outline"><Link to="/support" onClick={() => onOpenChange(false)}>الدعم والمساعدة</Link></Button>
      <Button type="button" onClick={() => onOpenChange(false)}>إغلاق</Button>
    </DialogContent>
  </Dialog>;
}
