import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PASSING_FIELDS } from '../../../../shared/passing-policy.js';
import { RECITATION_MARK_LABELS } from '../../../../shared/recitation-mark-types.js';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';

export function PassingResultSummary({ result }) {
  if (!result) return <span className="text-sm text-muted-foreground">لم يُقيّم</span>;
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
    <strong className={result.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}>{result.passed ? 'اجتاز' : 'يحتاج إعادة'}</strong>
    <span>الدرجة {result.score}/{result.maxScore}</span>
    <span>أخطاء/لحون: {result.mistakeCount}</span><span>تنبيهات: {result.warningCount}</span><span>ترددات: {result.hesitationCount}</span>
    {result.reasons?.length > 0 && <p className="basis-full text-xs leading-6 text-destructive">{result.reasons.join('، ')}</p>}
  </div>;
}
export default function PassingAttemptReport({ part, onClose }) {
  return <Dialog open={Boolean(part)} onOpenChange={open => !open && onClose()}>
    <DialogContent dir="rtl" className="max-h-[88dvh] max-w-2xl overflow-y-auto bg-card [font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>تقرير الجزء {part?.juzNumber}</DialogTitle></DialogHeader>
      {!part?.attempts.length ? <p className="text-sm text-muted-foreground">لم يبدأ تسميع هذا الجزء.</p> : part.attempts.map((attempt, index) => <section key={attempt.id} className="space-y-3 rounded-xl border border-border p-3">
        <h3 className="text-sm font-bold">المحاولة {part.attempts.length - index} · {formatHijriDate(attempt.createdAt.slice(0, 10))} · {attempt.actorName}</h3>
        <PassingResultSummary result={attempt.result} />
        <p className="text-xs text-muted-foreground">{attempt.rehifzDecision === 'repeat'
          ? `إعادة حفظ الجزء كاملًا · ${attempt.rehifzStatus === 'completed' ? 'اكتملت' : 'ضمن الخطة'}`
          : attempt.rehifzDecision === 'pending' ? 'قرار إعادة الحفظ لم يُحدد بعد' : 'إبقاء الخطة'}</p>
        {attempt.mode === 'count' && <p className="text-xs text-muted-foreground">سُجلت الأعداد فقط؛ مواضع الأخطاء غير محددة.</p>}
        {attempt.marks.map((mark, position) => <div key={position} className="space-y-1 rounded-lg bg-muted/50 p-3">
          <p className="text-xs font-bold">{RECITATION_MARK_LABELS[mark.markType]} · سورة وآية {String(mark.startLocation).split(':').slice(0, 2).join(':')}
            {mark.endLocation !== mark.startLocation && ` إلى ${String(mark.endLocation).split(':').slice(0, 2).join(':')}`}</p>
          <p className="break-words text-lg leading-loose">{mark.selectedText}</p>
          {mark.notes && <p className="break-words text-sm text-muted-foreground">{mark.notes}</p>}
        </div>)}
        <details className="text-xs"><summary className="min-h-11 cursor-pointer py-3 font-bold">الإعدادات المستخدمة</summary>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{PASSING_FIELDS.map(field => <div key={field.key}><dt className="inline text-muted-foreground">{field.label}: </dt><dd className="inline">{attempt.policy[field.key] ?? 'غير مفعّل'}</dd></div>)}</dl>
        </details>
      </section>)}
      <DialogFooter><Button variant="outline" className="min-h-11" onClick={onClose}>إغلاق</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
