import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import CheckboxOption from '@/components/ui/checkbox-option';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import { filterRosterByName, selectVisibleRoster } from '@/lib/rosterSearch';

export default function StudentPointsDialog({ program, onClose, loadGrades, saveGrades }) {
  const [students, setStudents] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [selected, setSelected] = useState([]);
  const [bulkPoints, setBulkPoints] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState('');
  const [committee, setCommittee] = useState('all');
  useEffect(() => {
    if (!program) return;
    let active = true;
    setLoading(true); setError(''); setStudents([]); setSelected([]); setBulkPoints(''); setValues({}); setSearch(''); setCommittee('all');
    loadGrades(program.id).then(({ students: rows }) => {
      if (!active) return;
      setStudents(rows); setValues(Object.fromEntries(rows.map(row => [row.id, row.completedAt ? String(row.earnedPoints) : ''])));
    }).catch(error_ => { if (active) setError(error_.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [program, retry, loadGrades]);
  // Dialog children are evaluated even when closed; the previous roster survives
  // closing until the next load, while program has already become null.
  if (!program) return null;
  const valid = value => String(value ?? '').trim() !== '' && Number.isSafeInteger(Number(value))
    && Number(value) >= 0 && Number(value) <= Number(program?.pointsReward);
  const changed = students.filter(student => String(values[student.id] ?? '').trim() !== ''
    && (!student.completedAt || Number(values[student.id]) !== Number(student.earnedPoints)));
  const save = async () => {
    if (savingRef.current) return;
    const useBulk = bulkPoints.trim() !== '';
    const targets = selected.length ? students.filter(student => selected.includes(student.id)) : changed;
    const nextValues = useBulk ? { ...values, ...Object.fromEntries(selected.map(id => [id, bulkPoints])) } : values;
    if (useBulk && !selected.length) { setError('حدد الطلاب أولًا.'); return; }
    if (!targets.length) { setError('حدد الطلاب وأدخل النقاط المراد حفظها.'); return; }
    if (targets.some(student => !valid(nextValues[student.id]))) {
      setError(`أدخل نقاطًا صحيحة من 0 إلى ${program.pointsReward}.`); return;
    }
    setValues(nextValues);
    savingRef.current = true; setSaving(true); setError('');
    try {
      const result = await saveGrades(program.id, targets.map(student => ({ studentId: Number(student.id), points: Number(nextValues[student.id]) })));
      const saved = new Map(result.grades.map(row => [Number(row.studentId), row.earnedPoints]));
      setStudents(rows => rows.map(row => saved.has(Number(row.id)) ? { ...row, earnedPoints: saved.get(Number(row.id)), completedAt: true } : row));
    } catch (error_) { setError(error_.message); } finally { savingRef.current = false; setSaving(false); }
  };
  const toggle = (id, checked) => setSelected(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id));
  const committees = [...new Map(students.map(student => [String(student.committeeId ?? 'none'), student.committeeName || 'بدون حلقة'])).entries()];
  const visibleStudents = filterRosterByName(students, search).filter(student => committee === 'all' || String(student.committeeId ?? 'none') === committee);
  const selectAll = visibleStudents.length > 0 && visibleStudents.every(student => selected.includes(student.id));
  return <Dialog open={Boolean(program)} onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent dir="rtl" className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden [font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>{program?.title} — تسجيل النقاط</DialogTitle></DialogHeader>
      <div className="grid min-w-0 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
      <Input type="search" aria-label="ابحث باسم الطالب" placeholder="ابحث باسم الطالب" value={search} onChange={event => setSearch(event.target.value)} disabled={loading || saving} className="min-h-11 shrink-0" />
      <Select value={committee} onValueChange={value => { setCommittee(value); setSelected([]); }} disabled={loading || saving}>
        <SelectTrigger aria-label="الحلقة" className="min-h-11 min-w-0 [&_span]:truncate"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">كل الحلقات</SelectItem>{committees.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
      </Select>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain">
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>{!students.length && <Button variant="outline" onClick={() => setRetry(value => value + 1)}>إعادة المحاولة</Button>}</div>}
      {loading ? <DashboardLoader /> : <>
        {students.length > 0 && <fieldset disabled={saving} className="space-y-3 rounded-xl border p-3">
          <CheckboxOption checked={selectAll} onCheckedChange={checked => setSelected(current => selectVisibleRoster(current, visibleStudents, checked))} label="تحديد الكل" className="flex items-center gap-2 px-2">
            <span className={`grid h-5 w-5 place-items-center rounded border ${selectAll ? 'bg-primary text-primary-foreground' : 'text-transparent'}`}><Check size={16} /></span><span>تحديد الكل</span>
          </CheckboxOption>
          <div className="flex flex-wrap gap-2">
            <Input type="number" aria-label="نقاط المحددين" min="0" max={program?.pointsReward} step="1" value={bulkPoints} onChange={event => setBulkPoints(event.target.value)} className="min-h-11 min-w-0 flex-1" />
          </div>
        </fieldset>}
        <fieldset disabled={saving} className="space-y-3">{visibleStudents.map(student => {
          const value = values[student.id] ?? '';
          const checked = selected.includes(student.id);
          return <div key={student.id} className="flex min-w-0 items-center gap-2 rounded-xl border border-border px-2 py-1">
              <CheckboxOption checked={checked} onCheckedChange={next => toggle(student.id, next)} label={`تحديد ${student.name}`} className="flex min-w-0 flex-1 items-center gap-2 px-1">
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${checked ? 'bg-primary text-primary-foreground' : 'text-transparent'}`}><Check size={16} /></span><span className="min-w-0 truncate text-sm font-bold" title={student.name}>{student.name}</span>
              </CheckboxOption>
              <Input aria-label={`نقاط ${student.name}`} id={`student-grade-${student.id}`} type="number" min="0" max={program.pointsReward} step="1" value={value} aria-invalid={value !== '' && !valid(value)} onChange={event => setValues(current => ({ ...current, [student.id]: event.target.value }))} className="h-11 w-20 min-w-0 shrink-0 text-center sm:w-24" />
          </div>;
        })}</fieldset>
        {!students.length && !error && <p className="text-sm text-muted-foreground">لا يوجد طلاب.</p>}
        {students.length > 0 && !visibleStudents.length && <p className="text-sm text-muted-foreground">لا توجد نتائج مطابقة.</p>}
      </>}
      </div>
      <DialogFooter className="shrink-0 flex-nowrap border-t bg-card pt-3" dir="rtl">
        <Button variant="outline" className="min-h-11" disabled={saving} onClick={onClose}>إغلاق</Button>
        <Button className="min-h-11" disabled={saving || loading || !students.length} onClick={save}>{saving ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
