import React, { useEffect, useState } from 'react';
import { AlertTriangle, Eraser, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const MushafWordMarkDialog = ({ open, selectedText = '', canClear = false, onCancel, onClear, onSave }) => {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (open) setNotes('');
  }, [open, selectedText]);

  const save = (markType) => {
    onSave?.(markType, notes);
    setNotes('');
  };

  const clear = () => {
    onClear?.();
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel?.()}>
      <DialogContent className="max-w-lg overflow-hidden border-primary/25 bg-card p-0 text-foreground" dir="rtl">
        <DialogTitle className="sr-only">تحديد موضع التسميع</DialogTitle>
        <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          <div
            className="rounded-xl border border-primary/20 bg-background/80 px-4 py-3 text-center text-2xl font-normal leading-[2.15] shadow-inner"
            style={{ fontFamily: "'Uthmanic-Hafs', 'Amiri', serif" }}
            translate="no"
          >
            {selectedText || 'الكلمات المحددة'}
          </div>
          <div className={`grid gap-2 ${canClear ? 'grid-cols-2 min-[400px]:grid-cols-4' : 'grid-cols-3'}`}>
            <Button type="button" variant="outline" onClick={() => save('warning')} className="h-12 gap-1.5 border-amber-400/50 bg-amber-400/5 px-2 text-amber-600 hover:bg-amber-400/15 hover:text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              تنبيه
            </Button>
            <Button type="button" variant="outline" onClick={() => save('mistake')} className="h-12 gap-1.5 border-red-400/50 bg-red-400/5 px-2 text-red-600 hover:bg-red-400/15 hover:text-red-700">
              <XCircle className="h-4 w-4" />
              خطأ
            </Button>
            <Button type="button" variant="outline" onClick={() => save('lahn')} className="h-12 gap-1.5 border-emerald-400/50 bg-emerald-400/5 px-2 text-emerald-700 hover:bg-emerald-400/15 hover:text-emerald-800 dark:text-emerald-300">
              <X className="h-4 w-4" />
              لحن
            </Button>
            {canClear && (
              <Button type="button" variant="outline" onClick={clear} className="h-12 gap-1.5 border-slate-400/50 bg-slate-400/5 px-2 text-muted-foreground hover:bg-slate-400/15 hover:text-foreground">
                <Eraser className="h-4 w-4" />
                مسح
              </Button>
            )}
          </div>
          <div className="space-y-2">
            <Label>ملاحظة</Label>
            <Textarea aria-label="ملاحظة" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="min-h-20 resize-y bg-background/80" placeholder="اكتب ملاحظة عن الموضع إن احتجت" />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MushafWordMarkDialog;
