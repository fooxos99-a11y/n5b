import React from 'react';
import AccountPrivacySection from '@/components/account/AccountPrivacySection';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { accountDeletionDescription } from '../../../shared/legal-content.js';

const AccountDeletionDialog = ({ open, onOpenChange, managedByPlatform = false }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-md border-primary/25 bg-card text-foreground" dir="rtl">
      <DialogHeader><DialogTitle>طلب حذف الحساب</DialogTitle><DialogDescription>{accountDeletionDescription}</DialogDescription></DialogHeader>
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
