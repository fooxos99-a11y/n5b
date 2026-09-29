import React from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import AccountLoginForm from './AccountLoginForm';

const AccountLoginDialog = ({ open, onOpenChange, onLogin, loading }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-2rem)] max-w-md rounded-3xl border-[#dfa33b]/30 bg-card p-5 shadow-[0_28px_80px_rgba(0,38,52,.28)] sm:p-7 [font-family:var(--font-ui)]"
        dir="rtl"
      >
        <DialogTitle className="sr-only">تسجيل الدخول</DialogTitle>

        <AccountLoginForm onLogin={onLogin} loading={loading} />
      </DialogContent>
    </Dialog>
  );
};

export default AccountLoginDialog;
