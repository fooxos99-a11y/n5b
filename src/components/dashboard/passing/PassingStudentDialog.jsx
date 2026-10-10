import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from '../DashboardLoader';
import { passingApi } from '@/services/passingApi';
import { PASSING_TYPES } from '../../../../shared/passing-policy.js';
import PassingAttemptReport, { PassingResultSummary } from './PassingAttemptReport';
import PassingPartEvaluation from './PassingPartEvaluation';

export default function PassingStudentDialog({ student, type, onClose }) {
  const [parts, setParts] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [evaluating, setEvaluating] = useState(null);
  const [report, setReport] = useState(null);
  const loadRevision = useRef(0);
  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoading(true); setLoadError('');
    try {
      const result = await passingApi.studentParts(student.id, type);
      if (revision === loadRevision.current) { setParts(result.parts); setExams(result.exams); }
    } catch (error) { if (revision === loadRevision.current) setLoadError(error.message); }
    finally { if (revision === loadRevision.current) setLoading(false); }
  }, [student.id, type]);
  useEffect(() => {
    const revision = loadRevision;
    load();
    return () => { revision.current++; };
  }, [load]);
  const openHafiz = type === 'hafiz' ? exams.find(exam => exam.status !== 'passed') : null;
  const examPart = number => (openHafiz ? [openHafiz] : exams).flatMap(exam => exam.parts).find(part => Number(part.juzNumber) === number);
  const start = async eligible => {
    if (saving) return;
    const existing = examPart(eligible.juzNumber);
    if (existing && (existing.latestAttempt?.rehifzDecision === 'pending' || !existing.latestAttempt?.result.passed)) {
      setEvaluating(existing); return;
    }
    setSaving(true); setSaveError('');
    try {
      const exam = await passingApi.create({ studentId: Number(student.id), type, ...(type === 'branch' ? { juz: eligible.juzNumber } : {}) });
      setExams(current => [exam, ...current]);
      setEvaluating(exam.parts.find(part => Number(part.juzNumber) === eligible.juzNumber));
    } catch (error) { setSaveError(error.message); }
    finally { setSaving(false); }
  };
  return <>
    <Dialog open={!evaluating} onOpenChange={open => !open && !saving && !evaluating && !report && onClose()}>
      <DialogContent dir="rtl" className="max-h-[88dvh] max-w-3xl overflow-y-auto bg-card [font-family:var(--font-ui)]">
        <DialogHeader><DialogTitle>{student.name}، {PASSING_TYPES[type]}</DialogTitle></DialogHeader>
        {loading ? <DashboardLoader /> : loadError ? <ErrorState message={loadError} onRetry={load} /> : !parts.length
          ? <p className="py-6 text-center text-sm text-muted-foreground">{type === 'branch'
            ? 'لم يُكمل الطالب جزءًا كاملًا معتمدًا ضمن خطته.' : 'لا يوجد جزء محفوظ كامل ومعتمد لهذا الطالب.'}</p>
          : parts.map(eligible => {
            const existing = examPart(eligible.juzNumber);
            const history = exams.flatMap(exam => exam.parts.filter(part => Number(part.juzNumber) === eligible.juzNumber).flatMap(part => part.attempts));
            const pendingDecision = existing?.latestAttempt?.rehifzDecision === 'pending';
            const waiting = Boolean(openHafiz && (!existing || existing.latestAttempt?.result.passed) && !pendingDecision);
            return <section key={eligible.juzNumber} className="space-y-3 border-b border-border pb-4" aria-label={`الجزء ${eligible.juzNumber}`}>
              <h3 className="font-bold text-primary">الجزء {eligible.juzNumber}</h3>
              <ul className="space-y-1 text-xs leading-6 text-muted-foreground">{eligible.ranges.map((range, index) => <li key={index}>
                {range.startSurahName || `سورة ${range.startSurah}`} {range.startAyah} إلى {range.endSurahName || `سورة ${range.endSurah}`} {range.endAyah}
              </li>)}</ul>
              <PassingResultSummary result={existing?.latestAttempt?.result} />
              <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" disabled={saving || waiting} loading={saving} onClick={() => start(eligible)}>
                  {pendingDecision ? 'تحديد إعادة الحفظ' : existing?.latestAttempt?.result.passed ? 'إعادة اختبار الجزء'
                    : existing?.latestAttempt ? 'إعادة تسميع الجزء' : 'بدء تسميع الجزء'}
                </Button>
                <Button variant="outline" className="min-h-11" disabled={saving} onClick={() => setReport({ ...eligible, attempts: history })}>
                  تقرير الجزء{history.length > 0 && ` (${history.length})`}
                </Button>
              </div>
              {waiting && !existing && <p className="text-xs text-muted-foreground">أكمل اجتياز الحافظ الحالي أولًا.</p>}
            </section>;
          })}
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <DialogFooter><Button variant="outline" className="min-h-11" disabled={saving} onClick={onClose}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <PassingAttemptReport part={report} onClose={() => setReport(null)} />
    {evaluating && <PassingPartEvaluation key={evaluating.id} part={evaluating} onClose={() => setEvaluating(null)} onSaved={load} />}
  </>;
}
