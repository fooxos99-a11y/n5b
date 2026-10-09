import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, ManagementPanel, ManagementToolbar, ManagementEmpty } from '../layout/ManagementPanel';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from '../DashboardLoader';
import { passingApi } from '@/services/passingApi';
import { PASSING_TYPES, PASSING_STATUS_LABELS } from '../../../../shared/passing-policy.js';
import { formatHijriDate } from '../../../../shared/hijri-calendar.js';
import PassingAttemptReport, { PassingResultSummary } from './PassingAttemptReport';
import PassingPartEvaluation from './PassingPartEvaluation';

export default function PassingSection() {
  const [type, setType] = useState('branch');
  const [exams, setExams] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [juz, setJuz] = useState('1');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [evaluating, setEvaluating] = useState(null);
  const [report, setReport] = useState(null);
  const loadRevision = useRef(0);
  const load = useCallback(async () => {
    const revision = ++loadRevision.current;
    setLoadError(''); setLoading(true);
    try { const [rows, options] = await Promise.all([passingApi.list(type), passingApi.students()]);
      if (revision === loadRevision.current) { setExams(rows); setStudents(options); } }
    catch (error) { if (revision === loadRevision.current) setLoadError(error.message); }
    finally { if (revision === loadRevision.current) setLoading(false); }
  }, [type]);
  useEffect(() => { load(); }, [load]);
  const selected = exams.find(exam => Number(exam.id) === Number(selectedId));
  const visible = exams.filter(exam => !search.trim() || `${exam.studentName} ${exam.committeeName || ''}`.includes(search.trim()));
  return <div dir="rtl" className="space-y-4 [font-family:var(--font-ui)]">
    <div role="group" aria-label="نوع الاجتياز" className="grid grid-cols-2 gap-2 sm:max-w-md">
      {Object.entries(PASSING_TYPES).map(([key, label]) => <Button key={key} variant={type === key ? 'default' : 'outline'} aria-pressed={type === key}
        className="min-h-11" onClick={() => { setType(key); setSelectedId(null); }}>{label}</Button>)}
    </div>
    <ManagementPanel>
      <ManagementToolbar>
        <Input type="search" aria-label="ابحث عن طالب" placeholder="ابحث عن طالب" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1 basis-40 sm:max-w-sm" />
        <Button className="min-h-11 gap-2" onClick={() => { setSaveError(''); setStudentId(''); setCreateOpen(true); }} disabled={loading || Boolean(loadError)}><Plus className="h-4 w-4" />اجتياز جديد</Button>
      </ManagementToolbar>
      {loading ? <DashboardLoader /> : loadError ? <ErrorState message={loadError} onRetry={load} /> : !visible.length ? <ManagementEmpty>لا توجد اختبارات اجتياز.</ManagementEmpty>
        : <ul className="divide-y divide-border" aria-label="اختبارات الاجتياز">{visible.map(exam => <li key={exam.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0 flex-1"><h3 className="truncate font-bold">{exam.studentName}</h3>
            <p className="text-xs leading-6 text-muted-foreground">{exam.committeeName} · {formatHijriDate(exam.createdAt.slice(0, 10))}</p>
            <p className="text-sm">{PASSING_STATUS_LABELS[exam.status]} · {exam.parts.filter(part => part.latestAttempt?.result.passed).length}/{exam.parts.length} أجزاء مجتازة
              {type === 'branch' && ` · الجزء ${exam.parts[0].juzNumber}`}</p>
          </div><Button variant="outline" className="min-h-11" onClick={() => setSelectedId(exam.id)}>فتح الاجتياز</Button>
        </li>)}</ul>}
    </ManagementPanel>
    <Dialog open={createOpen} onOpenChange={open => !saving && setCreateOpen(open)}>
      <DialogContent dir="rtl" className="max-w-md bg-card [font-family:var(--font-ui)]">
        <DialogHeader><DialogTitle>{PASSING_TYPES[type]} جديد</DialogTitle></DialogHeader>
        <FormField label="الطالب"><Select value={studentId} onValueChange={setStudentId}><SelectTrigger aria-label="الطالب"><SelectValue placeholder="اختر الطالب" /></SelectTrigger>
          <SelectContent>{students.map(student => <SelectItem key={student.id} value={String(student.id)}>{student.name} — {student.committeeName || 'بدون حلقة'}</SelectItem>)}</SelectContent></Select></FormField>
        {type === 'branch' ? <FormField label="الجزء"><Select value={juz} onValueChange={setJuz}><SelectTrigger aria-label="الجزء"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 30 }, (_, index) => <SelectItem key={index + 1} value={String(index + 1)}>الجزء {index + 1}</SelectItem>)}</SelectContent></Select></FormField>
          : <p className="text-sm leading-6 text-muted-foreground">يشمل الأجزاء المحفوظة كاملة والمعتمدة، وتُحفظ نتيجة كل جزء منفصلة.</p>}
        {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
        <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>إلغاء</Button>
          <Button loading={saving} disabled={!studentId} onClick={async () => {
            setSaving(true); setSaveError('');
            try { const exam = await passingApi.create({ studentId: Number(studentId), type, ...(type === 'branch' ? { juz: Number(juz) } : {}) });
              setExams(current => [exam, ...current]); setCreateOpen(false); setSelectedId(exam.id); }
            catch (error) { setSaveError(error.message); } finally { setSaving(false); }
          }}>إنشاء الاجتياز</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(selected) && !evaluating} onOpenChange={open => !open && !report && !evaluating && setSelectedId(null)}>
      <DialogContent dir="rtl" className="max-h-[88dvh] max-w-3xl overflow-y-auto bg-card [font-family:var(--font-ui)]">
        <DialogHeader><DialogTitle>{selected?.studentName} — {PASSING_TYPES[type]}</DialogTitle>
          <p className="text-sm text-muted-foreground">{PASSING_STATUS_LABELS[selected?.status]}</p></DialogHeader>
        {selected?.parts.map(part => <section key={part.id} className="space-y-3 border-b border-border pb-4" aria-label={`الجزء ${part.juzNumber}`}>
          <h3 className="font-bold text-primary">الجزء {part.juzNumber}</h3>
          <ul className="space-y-1 text-xs leading-6 text-muted-foreground">{part.ranges.map((range, index) => <li key={index}>
            {range.startSurahName || `سورة ${range.startSurah}`} {range.startAyah} إلى {range.endSurahName || `سورة ${range.endSurah}`} {range.endAyah}</li>)}</ul>
          <PassingResultSummary result={part.latestAttempt?.result} />
          <div className="flex flex-wrap gap-2">
            {part.latestAttempt?.rehifzDecision === 'pending'
              ? <Button className="min-h-11" onClick={() => setEvaluating(part)}>تحديد إعادة الحفظ</Button>
              : !part.latestAttempt?.result.passed && <Button className="min-h-11" onClick={() => setEvaluating(part)}>{part.latestAttempt ? 'إعادة تسميع الجزء' : 'بدء تسميع الجزء'}</Button>}
            <Button variant="outline" className="min-h-11" onClick={() => setReport(part)}>تقرير الجزء{part.attempts.length > 0 && ` (${part.attempts.length})`}</Button>
          </div>
        </section>)}
        <DialogFooter><Button variant="outline" className="min-h-11" onClick={() => setSelectedId(null)}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <PassingAttemptReport part={report} onClose={() => setReport(null)} />
    {evaluating && <PassingPartEvaluation key={evaluating.id} part={evaluating} onClose={() => setEvaluating(null)} onSaved={load} />}
  </div>;
}
