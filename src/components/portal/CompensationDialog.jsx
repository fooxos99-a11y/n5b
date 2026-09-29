import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { studentsApi } from '@/services/studentsApi';

const Section = ({ title, owed, done, status = '', children }) => (
  <section className="space-y-2 rounded-xl border border-primary/15 bg-background/60 p-3">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-black text-foreground">{title}</h3>
      <span className="text-xs font-bold text-muted-foreground tabular-nums">
        {status || (owed ? `عليه ${owed}` : 'لا يوجد تعويض')}{done ? ` · عوّض ${done}` : ''}
      </span>
    </div>
    {children}
  </section>
);

const Blocked = ({ text }) => (text ? <p className="text-xs font-bold text-muted-foreground">{text}</p> : null);

/**
 * Missed days since the plan started, as amounts the teacher recites one at a time.
 * Each compensation opens the usual recitation (count or Mushaf) for exactly that amount.
 */
export default function CompensationDialog({ open, onOpenChange, supervisorId, student, date, onRecite }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [busyType, setBusyType] = useState('');
  const studentId = student?.studentId;

  const loadSummary = useCallback(async () => {
    if (!studentId) return;
    setError('');
    try {
      setSummary(await studentsApi.getQuranCompensations(supervisorId, { studentId, date }));
    } catch (loadError) {
      setError(loadError.message || 'تعذر تحميل التعويض.');
    }
  }, [date, studentId, supervisorId]);

  useEffect(() => {
    if (!open) {
      setSummary(null);
      return;
    }
    void loadSummary();
  }, [loadSummary, open]);

  const recite = async (taskType) => {
    setBusyType(taskType);
    setError('');
    try {
      const created = await studentsApi.createQuranCompensation(supervisorId, { studentId, taskType, date });
      await onRecite?.(student, created.taskIds || []);
    } catch (createError) {
      setError(createError.message || 'تعذر تجهيز التعويض.');
      void loadSummary();
    } finally {
      setBusyType('');
    }
  };

  // Tolerate a partial response (for example an older server) instead of breaking the page.
  const section = (value) => ({ owed: 0, done: 0, blocked: null, pendingTaskIds: [], items: [], label: '', pendingLabel: '', ...value });
  const memorization = section(summary?.memorization);
  const link = section(summary?.link);
  const review = section(summary?.review);
  const reciteLabel = (pending) => (pending?.length ? 'متابعة التسميع' : 'تسميع');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-primary/30 bg-card [font-family:var(--font-ui)]" dir="rtl">
        <DialogHeader><DialogTitle className="text-right text-primary neon-text">{`تعويض ${student?.studentName || ''}`}</DialogTitle></DialogHeader>
        {!summary && !error && <p className="text-sm text-muted-foreground">جارٍ حساب التعويض…</p>}
        {error && <p role="alert" className="text-sm font-bold text-destructive">{error}</p>}
        {summary && (
          <div className="max-h-[65dvh] space-y-3 overflow-y-auto pr-1">
            <Section title="الحفظ" owed={memorization.owed} done={memorization.done}>
              <Blocked text={memorization.owed ? memorization.blocked : ''} />
              {memorization.pendingLabel && (
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{`قيد التسميع: ${memorization.pendingLabel}`}</span>
                </div>
              )}
              {memorization.items.length > 0 && (
                <ol className="space-y-1 text-sm">
                  {memorization.items.map((item, index) => (
                    <li key={item.label} className="flex items-center justify-between gap-2">
                      <span>{`تعويض ${memorization.done + (memorization.pendingLabel ? 1 : 0) + index + 1}: ${item.label}`}</span>
                    </li>
                  ))}
                </ol>
              )}
              {memorization.owed > 0 && (
                <Button type="button" className="min-h-11 w-full text-white hover:text-white" disabled={Boolean(busyType) || (!memorization.pendingTaskIds.length && Boolean(memorization.blocked))}
                  onClick={() => void recite('memorization')}>
                  {busyType === 'memorization' ? 'جارٍ التجهيز…' : reciteLabel(memorization.pendingTaskIds)}
                </Button>
              )}
            </Section>
            <Section title="الربط" owed={link.owed} done={link.done}>
              {link.owed > 0 && link.label && <p className="text-sm">{`يكرر ربط اليوم: ${link.label}`}</p>}
              <Blocked text={link.owed ? link.blocked : ''} />
              {link.owed > 0 && (
                <Button type="button" className="min-h-11 w-full text-white hover:text-white" disabled={Boolean(busyType) || (!link.pendingTaskIds.length && Boolean(link.blocked))}
                  onClick={() => void recite('link')}>
                  {busyType === 'link' ? 'جارٍ التجهيز…' : reciteLabel(link.pendingTaskIds)}
                </Button>
              )}
            </Section>
            <Section title="المراجعة" owed={review.owed} done={review.done}>
              {review.owed > 0 && review.label && (
                <p className="text-sm">{`${review.pendingTaskIds.length ? 'قيد التسميع' : 'التعويض التالي'}: ${review.label}`}</p>
              )}
              <Blocked text={review.owed ? review.blocked : ''} />
              {review.owed > 0 && <p className="text-sm text-muted-foreground">تُضاف المراجعة الفائتة إلى مقدار المراجعة في جلسة التسميع.</p>}
            </Section>
          </div>
        )}
        <DialogFooter className="!flex-row !justify-start gap-2" dir="rtl">
          <Button type="button" variant="outline" className="min-h-11 px-3" onClick={() => onOpenChange?.(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
