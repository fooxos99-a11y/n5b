import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from '../DashboardLoader';
import { passingApi } from '@/services/passingApi';
import { PASSING_TYPES } from '../../../../shared/passing-policy.js';
import { formatPassingPercentage } from '../../../../shared/passing-ratings.js';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import PassingAttemptReport, { PassingResultSummary } from './PassingAttemptReport';

export default function PassingStudentReport({ student, api = passingApi, initialType = 'all', onClose }) {
  const [type, setType] = useState(initialType);
  const [report, setReport] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [part, setPart] = useState(null);
  const loadRevision = useRef(0);
  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoading(true); setLoadError('');
    try {
      const result = await api.studentReport(student.id, type);
      if (revision === loadRevision.current) setReport(result);
    } catch (error) { if (revision === loadRevision.current) setLoadError(error.message); }
    finally { if (revision === loadRevision.current) setLoading(false); }
  }, [api, student.id, type]);
  useEffect(() => { const revision = loadRevision; load(); return () => { revision.current++; }; }, [load]);
  return <>
    <Dialog open={!part} onOpenChange={open => !open && !part && onClose()}>
      <DialogContent dir="rtl" className="max-h-[88dvh] max-w-3xl overflow-y-auto bg-card [font-family:var(--font-ui)]">
        <DialogHeader><DialogTitle>تقرير اختبارات {student.name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="passing-report-type">نوع الاختبارات</Label>
          <Select value={type} onValueChange={setType}><SelectTrigger id="passing-report-type" className="min-h-11"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">جميع الاختبارات</SelectItem>{Object.entries(PASSING_TYPES).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {loading ? <DashboardLoader /> : loadError ? <ErrorState message={loadError} onRetry={load} /> : report && <>
          <section aria-label="ملخص الاختبارات" className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1"><span>النسبة الإجمالية</span><strong className="text-2xl text-primary">{formatPassingPercentage(report.summary.percentage)}</strong>
              {report.summary.percentage !== null && <span className="font-bold">{report.summary.rating || 'التقدير غير مسجل'}</span>}</p>
            <p className="text-sm leading-7">الأجزاء المختبرة: {report.summary.testedParts} · المجتازة: {report.summary.passedParts} · المحاولات: {report.summary.attemptCount} · الأجزاء المحفوظة حاليًا: {report.summary.memorizedParts}</p>
            <p className="text-xs leading-6 text-muted-foreground">تُحسب الإجمالية من متوسط نسبة أحدث محاولة لكل جزء مختبر. الأجزاء غير المختبرة لا تدخل في المتوسط، ويُستخدم تقدير أحدث اختبار ضمن التقرير.</p>
          </section>
          {!report.parts.length ? <p className="py-6 text-center text-sm text-muted-foreground">لا توجد اختبارات مسجلة لهذا الطالب ضمن النوع المحدد.</p> : report.parts.map(row => <section key={row.juzNumber} className="space-y-3 border-b border-border pb-4" aria-label={`نتائج الجزء ${row.juzNumber}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-primary">الجزء {row.juzNumber}</h3>
              <Button variant="outline" className="min-h-11" onClick={() => setPart(row)} aria-label={`سجل الجزء ${row.juzNumber}`}>سجل الجزء ({row.attempts.length})</Button></div>
            <PassingResultSummary result={row.latestAttempt.result} />
            <p className="text-xs leading-6 text-muted-foreground">{PASSING_TYPES[row.latestAttempt.type]} · {formatHijriDate(row.latestAttempt.createdAt.slice(0, 10))} · {row.latestAttempt.actorName}</p>
          </section>)}
        </>}
        <DialogFooter><Button variant="outline" className="min-h-11" onClick={onClose}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {part && <PassingAttemptReport part={part} onClose={() => setPart(null)} />}
  </>;
}
