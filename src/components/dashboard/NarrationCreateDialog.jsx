import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField, FormGrid } from '@/components/dashboard/layout/ManagementPanel';
import { DashboardDatePicker } from '@/components/dashboard/DashboardControls';
import CommitteeMultiSelect from '@/components/dashboard/CommitteeMultiSelect';
import NarrationManualPreparation from './NarrationManualPreparation';
import { narrationRangeLabel } from './NarrationRangeEditor';
import { studentsApi } from '@/services/studentsApi';
import { getApiBase, getTenantRegistrationNumber } from '@/services/apiBase';
import { getBusinessDate } from '../../../shared/business-date.js';
import { narrationCommitteeIds } from '../../../shared/narration-committee-scope.js';
import { formatHijriDate } from '../../../shared/hijri-calendar.js';

const newForm = () => ({ name: '', startDate: getBusinessDate(), endDate: getBusinessDate(), complexId: 'all', committeeIds: ['all'], mode: 'full', assignments: {} });
const draftKey = () => `narration-draft:v1:${JSON.stringify([getApiBase(), getTenantRegistrationNumber(), localStorage.getItem('wajeh_role'), localStorage.getItem('wajeh_account_id') || localStorage.getItem('wajeh_supervisor_id')])}`;

export default function NarrationCreateDialog({ open, onOpenChange, committees, onCreate }) {
  const key = useMemo(draftKey, []);
  const [form, setForm] = useState(newForm);
  const [loadedDraft, setLoadedDraft] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [students, setStudents] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const editing = Boolean(form.editorDraft);
  const [saving, setSaving] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && Array.isArray(saved.committeeIds) && saved.assignments && ['manual', 'full'].includes(saved.mode)) setForm({ ...newForm(), ...saved });
    } catch { setStorageError('تعذر استعادة المسودة على هذا الجهاز.'); }
    setLoadedDraft(true);
  }, [key]);
  useEffect(() => {
    if (!loadedDraft) return;
    try { localStorage.setItem(key, JSON.stringify(form)); }
    catch { setStorageError('تعذر حفظ المسودة على هذا الجهاز. أبقِ الصفحة مفتوحة حتى تبدأ السرد.'); }
  }, [form, key, loadedDraft]);
  useEffect(() => {
    if (!open || form.mode !== 'manual') { setLoading(false); setError(''); return; }
    let active = true;
    setLoading(true); setError('');
    Promise.all([studentsApi.getNarrationPreparation(), studentsApi.getQuranChapters()])
      .then(([rows, references]) => { if (active) { setStudents(rows); setChapters(references); } })
      .catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, form.mode, retry]);
  const complexes = [...new Map(committees.filter(committee => committee.complexId).map(committee => [String(committee.complexId), { id: String(committee.complexId), name: committee.complexName }])).values()];
  const visibleCommittees = committees.filter(committee => form.complexId === 'all' || String(committee.complexId) === form.complexId);
  const committeeIds = narrationCommitteeIds(form, committees);
  const scopedStudents = students.filter(student => committeeIds.includes('all') || committeeIds.includes(String(student.committeeId)));
  const participants = scopedStudents.filter(student => form.assignments[String(student.id)]?.length);
  const update = patch => { setForm(current => ({ ...current, ...patch })); setReview(false); };
  const submit = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try {
      await onCreate({ ...form, committeeIds, assignments: form.mode === 'manual' ? participants.map(student => ({ studentId: student.id, ranges: form.assignments[String(student.id)] })) : undefined });
      setForm(newForm()); setReview(false); onOpenChange(false);
    } catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  };
  const disabled = loading || Boolean(error) || saving || editing || !form.name.trim() || !committeeIds.length || (form.mode === 'manual' && !participants.length);
  return <Dialog open={open} onOpenChange={value => { if (!saving) onOpenChange(value); }}>
    <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto bg-card sm:max-w-5xl [font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>{review ? 'مراجعة يوم السرد' : 'فتح يوم سرد'}</DialogTitle></DialogHeader>
      {storageError && <p role="alert" className="text-sm text-destructive">{storageError}</p>}
      {!review ? <>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="طريقة السرد">
          {[['full', 'المحفوظ كامل'], ['manual', 'يدوي']].map(([mode, label]) => <Button key={mode} aria-pressed={form.mode === mode} variant={form.mode === mode ? 'default' : 'outline'} disabled={saving || editing} onClick={() => update({ mode })}>{label}</Button>)}
        </div>
        <FormGrid className="grid-cols-2 py-2 sm:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 sm:col-span-1"><FormField label="اسم يوم السرد" htmlFor="narration-event-name"><Input id="narration-event-name" maxLength={180} value={form.name} onChange={event => update({ name: event.target.value })} /></FormField></div>
          {!editing && <FormField label="المجمع" htmlFor="narration-complex">
            <Select value={form.complexId} onValueChange={complexId => update({ complexId, committeeIds: ['all'] })} disabled={saving}>
              <SelectTrigger id="narration-complex"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">كل المجمعات</SelectItem>{complexes.map(complex => <SelectItem key={complex.id} value={complex.id}>{complex.name}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>}
          {!editing && <FormField label="الحلقات"><CommitteeMultiSelect committees={visibleCommittees} value={form.committeeIds} onChange={committeeIds => update({ committeeIds })} /></FormField>}
          <FormField label="البداية"><DashboardDatePicker value={form.startDate} max={form.endDate} onChange={startDate => update({ startDate })} ariaLabel="بداية يوم السرد" /></FormField>
          <FormField label="النهاية"><DashboardDatePicker value={form.endDate} min={form.startDate} onChange={endDate => update({ endDate })} ariaLabel="نهاية يوم السرد" /></FormField>
        </FormGrid>
        {form.mode === 'manual' && !loading && !error && <NarrationManualPreparation students={scopedStudents} chapters={chapters} assignments={form.assignments} onChange={assignments => update({ assignments })} editorDraft={form.editorDraft} onEditorChange={editorDraft => update({ editorDraft })} />}
      </> : <div className="space-y-3">
        <p className="font-bold">{form.name} · {formatHijriDate(form.startDate)} إلى {formatHijriDate(form.endDate)}</p>
        {form.mode === 'manual' && <>
          <p>المشاركون: {participants.length} · بدون مقاطع: {scopedStudents.length - participants.length}</p>
          {scopedStudents.length > participants.length && <p className="text-sm text-muted-foreground">لن يُضاف الطلاب الذين لم تُحدد لهم مقاطع.</p>}
          <ul className="divide-y">{participants.map(student => <li key={student.id} className="py-3">
            <strong>{student.name}</strong>
            {form.assignments[String(student.id)].map((range, index) => <p key={index} className="text-sm">{narrationRangeLabel(range, chapters)} · {Number(Number(range.faces).toFixed(2))} وجه</p>)}
          </li>)}</ul>
        </>}
      </div>}
      {loading && <p role="status">جارٍ تحميل الطلاب</p>}
      {error && <div role="alert"><p className="text-destructive">{error}</p><Button variant="outline" onClick={() => { setError(''); setRetry(value => value + 1); }}>إعادة المحاولة</Button></div>}
      <DialogFooter className="gap-2">
        <Button variant="outline" disabled={saving} onClick={() => review ? setReview(false) : onOpenChange(false)}>{review ? 'رجوع' : 'إغلاق وحفظ المسودة'}</Button>
        <Button disabled={disabled} onClick={review ? submit : () => setReview(true)}>{saving ? 'جارٍ فتح يوم السرد' : review ? 'بدء السرد' : 'مراجعة وبدء'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
