import React from 'react';
import AccountPrivacySection from '@/components/account/AccountPrivacySection';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const AccountDeletionDialog = ({ open, onOpenChange, managedByPlatform = false }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md border-primary/25 bg-card text-foreground" dir="rtl">
      <DialogHeader><DialogTitle>طلب حذف الحساب</DialogTitle></DialogHeader>
      <AccountPrivacySection
        compact
        embeddedConfirmation
        managedByPlatform={managedByPlatform}
        onClose={() => onOpenChange(false)}
      />
    </DialogContent>
  </Dialog>
);

export default AccountDeletionDialog;
