import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PointsValue from '@/components/points/PointsValue';

export default function StorePurchaseDialog({ product, busy, onClose, onConfirm }) {
  return <Dialog open={Boolean(product)} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent dir="rtl" overlayClassName="z-[100]" className="z-[110] [font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>تأكيد الشراء</DialogTitle></DialogHeader>
      <div className="space-y-3 text-sm">
        <div className="font-bold">{product?.name}</div>
        <PointsValue value={product?.pointsPrice || 0} />
        <p>تُحجز النقاط حتى مراجعة الطلب، وتُعاد عند رفضه.</p>
      </div>
      <DialogFooter>
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>إلغاء</Button>
        <Button className="min-h-11" disabled={busy} onClick={() => onConfirm(product)}>{busy ? 'جاري إرسال الطلب...' : 'تأكيد الشراء'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
