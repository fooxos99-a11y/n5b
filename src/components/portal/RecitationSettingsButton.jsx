import React, { lazy, Suspense, useState } from 'react';
import { Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DashboardLoader from '@/components/dashboard/DashboardLoader';

const RecitationSessionSettings = lazy(() => import('@/components/portal/RecitationSessionSettings'));

export default function RecitationSettingsButton({ staffId }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shadow-none" aria-label="إعدادات جلسات التسميع" onClick={() => setOpen(true)}>
      <Settings className="h-4 w-4" aria-hidden="true" />
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="w-[calc(100%-24px)] max-w-md [font-family:var(--font-ui)]" dir="rtl" aria-describedby={undefined}>
        <div className="flex items-center justify-between gap-3">
          <DialogHeader><DialogTitle>إعدادات جلسات التسميع</DialogTitle></DialogHeader>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="إغلاق الإعدادات" onClick={() => setOpen(false)}><X className="h-5 w-5" /></Button>
        </div>
        <Suspense fallback={<DashboardLoader className="min-h-[180px]" />}>
          <RecitationSessionSettings staffId={staffId} />
        </Suspense>
      </DialogContent>
    </Dialog>
  </>;
}
