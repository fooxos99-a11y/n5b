import React from 'react';
import { Button } from '@/components/ui/button';
import { recitationDeliveryLabels } from '@/lib/recitationDeliveryReceipts';

const labels = { memorization: 'حفظ', review: 'مراجعة', link: 'ربط' };
export default function RecitationDeliveryStatus({ receipts = [], onRefresh, loading = false }) {
  if (!receipts.length) return null;
  return <details className="min-w-0 rounded-xl border border-primary/20 p-3 [font-family:var(--font-ui)]" dir="rtl">
    <summary className="min-h-11 cursor-pointer rounded-md font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">حالة إرسال التسميع ({receipts.length})</summary>
    <ul className="space-y-3" aria-label="حالة إرسال التسميع" aria-live="polite">
      {receipts.map(row => <li key={row.taskId} className="min-w-0 border-t border-primary/10 pt-3 text-sm">
        <p className="break-words font-bold">{row.studentName} — {row.track === 'mastery' ? 'إتقان' : labels[row.taskType]} — {row.taskDate}</p>
        <p className={`mt-1 break-words ${['local_failed', 'local_rejected'].includes(row.status) ? 'text-destructive' : 'text-muted-foreground'}`}>{recitationDeliveryLabels[row.status] || recitationDeliveryLabels.nazem_pending}</p>
        {row.error && <p className="mt-1 break-words text-destructive">{row.error}</p>}
      </li>)}
    </ul>
    <Button type="button" variant="outline" className="mt-3 min-h-11" disabled={loading} onClick={onRefresh}>تحديث حالة الإرسال</Button>
  </details>;
}
