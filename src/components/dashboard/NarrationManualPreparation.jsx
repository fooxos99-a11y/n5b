import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CheckboxOption from '@/components/ui/checkbox-option';
import NarrationRangeEditor, { narrationRangeLabel } from './NarrationRangeEditor';

export default function NarrationManualPreparation({ students, chapters, assignments, onChange, editorDraft, onEditorChange }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const editing = editorDraft?.ids;
  const visible = students.filter(student => student.name.includes(search.trim()));
  const targets = selected.filter(id => students.some(student => String(student.id) === id));
  const edit = ids => onEditorChange(ids ? { ids, ranges: ids.length === 1 ? assignments[ids[0]] || [] : [] } : null);
  const apply = ranges => {
    onChange({ ...assignments, ...Object.fromEntries(editing.map(id => [id, ranges])) });
    edit(null); setSelected([]);
  };
  return <div className="space-y-3">
    <Input aria-label="البحث عن طالب" placeholder="ابحث باسم الطالب" value={search} onChange={event => setSearch(event.target.value)} />
    {!editing && <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={!visible.length} onClick={() => setSelected(visible.map(student => String(student.id)))}>تحديد الظاهرين ({visible.length})</Button>
      <Button disabled={!targets.length} onClick={() => edit(targets)}>تحديد مقاطع المحددين ({targets.length})</Button>
    </div>}
    {editing && <div className="space-y-2">
      <p className="font-bold">مقاطع {editing.length === 1 ? students.find(student => String(student.id) === editing[0])?.name : `${editing.length} طلاب`}</p>
      <NarrationRangeEditor key={editing.join(',')} chapters={chapters} initialRanges={editorDraft.ranges} onDraftChange={ranges => onEditorChange({ ids: editing, ranges })} onApply={apply} onCancel={() => edit(null)} />
    </div>}
    <ul className="divide-y rounded-xl border" aria-label="تجهيز طلاب السرد">
      {visible.map(student => {
        const id = String(student.id);
        const ranges = assignments[id] || [];
        return <li key={id} className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <CheckboxOption label={`تحديد ${student.name}`} checked={targets.includes(id)} onCheckedChange={checked => setSelected(current => checked ? [...new Set([...current, id])] : current.filter(value => value !== id))} className="flex min-w-0 items-center gap-2 px-2">
              <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded border ${targets.includes(id) ? 'bg-primary' : ''}`} />
              <span className="min-w-0 break-words font-bold">{student.name}<span className="block text-xs font-normal text-muted-foreground">{student.committeeName || 'بلا حلقة'}</span></span>
            </CheckboxOption>
            <Button variant="outline" disabled={Boolean(editing)} onClick={() => edit([id])}>{ranges.length ? 'تعديل المقاطع' : 'تحديد المقاطع'}</Button>
          </div>
          {ranges.length ? <>
            <ul className="space-y-1 text-sm">{ranges.map((range, index) => <li key={index}>{narrationRangeLabel(range, chapters)}</li>)}</ul>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>الأوجه: {Number(ranges.reduce((sum, range) => sum + Number(range.faces || 0), 0).toFixed(2))}</span>
              <Button variant="ghost" disabled={Boolean(editing)} onClick={() => { const next = { ...assignments }; delete next[id]; onChange(next); }}>إزالة المقاطع</Button>
            </div>
          </> : <p className="text-sm text-muted-foreground">لم تُحدد مقاطع — لن يشارك في هذا السرد.</p>}
        </li>;
      })}
    </ul>
    {!visible.length && <p className="py-3 text-center text-muted-foreground">لا يوجد طلاب مطابقون.</p>}
  </div>;
}
