import React, { useState } from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import SettingToggle from '@/components/ui/setting-toggle';

export default function StoreSettingsActions({ configuration, saving, onChange, deductionLabel }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="outline" size="icon" className="h-11 w-11" aria-label="إعدادات المتجر" onClick={() => setOpen(true)}><Settings className="h-5 w-5" /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent dir="rtl" className="max-w-md [font-family:var(--font-ui)]">
        <DialogHeader><DialogTitle>إعدادات المتجر</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <SettingToggle label="تفعيل المتجر" checked={configuration.storeEnabled} disabled={saving} onCheckedChange={(storeEnabled) => onChange({ storeEnabled })} />
          <SettingToggle label={deductionLabel} checked={configuration.storePurchaseDeductsRanking} disabled={!configuration.storeEnabled || saving} onCheckedChange={(storePurchaseDeductsRanking) => onChange({ storePurchaseDeductsRanking })} />
        </div>
        <DialogFooter><Button variant="outline" className="min-h-11" onClick={() => setOpen(false)}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
