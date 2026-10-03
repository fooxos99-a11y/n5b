import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import MultiSelectSetting from '@/components/ui/multi-select-setting';
import DatePicker from '@/components/ui/date-picker';
import { DEFAULT_NEWS_TEXT_COLOR } from '../../../shared/student-news';

export default function NewsEntryDialog({ entry, committees, pending, onClose, onSave }) {
  const [draft, setDraft] = useState({ ...entry, startsAt: (entry.startsAt || '').slice(0, 10), endsAt: (entry.endsAt || '').slice(0, 10) });
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const fileInput = useRef(null);
  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const toggleCommittee = id => {
    if (id === 'all') {
      update('committeeIds', []);
      return;
    }
    const selected = draft.committeeIds.includes(id);
    update('committeeIds', selected ? draft.committeeIds.filter(value => value !== id) : [...draft.committeeIds, id]);
  };
  const readImage = event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('اختر صورة PNG أو JPEG أو WebP بحجم أقصاه ٥ ميجابايت.'); return;
    }
    setReading(true); setError('');
    const reader = new FileReader();
    reader.onload = () => { update('image', reader.result); setReading(false); };
    reader.onerror = () => { setError('تعذرت قراءة الصورة.'); setReading(false); };
    reader.readAsDataURL(file);
  };
  const save = async event => {
    event.preventDefault(); setError('');
    // Saving this form explicitly replaces any legacy student targeting with circles.
    const value = { ...draft };
    delete value.legacyStudentIds;
    try { await onSave(value); } catch (reason) { setError(reason.message); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !pending && !reading) onClose(); }}>
    <DialogContent dir="rtl" aria-describedby={undefined} className="max-w-lg [font-family:var(--font-ui)]">
      <DialogTitle>{entry.title ? 'تعديل الخبر' : 'إضافة خبر'}</DialogTitle>
      <form onSubmit={save} className="min-w-0 space-y-4">
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <fieldset disabled={pending || reading} className="min-w-0 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="news-title">الخبر</Label><Input id="news-title" required maxLength={80} value={draft.title} onChange={event => update('title', event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="news-body">نص الخبر</Label><Textarea id="news-body" maxLength={2000} value={draft.body || ''} onChange={event => update('body', event.target.value)} /></div>
          <div className="grid min-w-0 grid-cols-[auto_minmax(0,12rem)] gap-3">
          <div className="min-w-0 space-y-1.5"><Label htmlFor="news-text-color">اللون</Label><Input id="news-text-color" type="color" className="h-11 w-11 cursor-pointer overflow-hidden rounded-xl border-0 p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-xl [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-xl [&::-moz-color-swatch]:border-0" value={draft.textColor || DEFAULT_NEWS_TEXT_COLOR} onChange={event => update('textColor', event.target.value)} /></div>
          <div className="min-w-0 space-y-1.5"><Label>الحلقات</Label>
            <MultiSelectSetting value={draft.committeeIds.length ? draft.committeeIds : ['all']} placeholder="جميع الحلقات"
              options={[{ value: 'all', label: 'جميع الحلقات' }, ...committees.map(row => ({ value: Number(row.id), label: row.name }))]}
              onToggle={toggleCommittee} />
          </div>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5"><Label>بداية العرض</Label><DatePicker ariaLabel="بداية العرض" value={draft.startsAt} onChange={value => update('startsAt', value)} /></div>
            <div className="min-w-0 space-y-1.5"><Label>نهاية العرض</Label><DatePicker ariaLabel="نهاية العرض" min={draft.startsAt || undefined} value={draft.endsAt} onChange={value => update('endsAt', value)} /></div>
          </div>
          <Input ref={fileInput} className="hidden" aria-label="صورة الخبر" type="file" accept="image/png,image/jpeg,image/webp" onChange={readImage} />
          <Button type="button" variant="outline" className="h-auto min-h-28 w-full overflow-hidden border-dashed p-3" onClick={() => fileInput.current?.click()}>
            {draft.image ? <img src={draft.image} alt="صورة الخبر" className="h-28 w-full object-contain" /> : 'إضافة صورة'}
          </Button>
          {draft.image && <Button type="button" variant="ghost" onClick={() => update('image', '')}>إزالة الصورة</Button>}
        </fieldset>
        <DialogFooter className="grid grid-cols-2 border-t pt-3">
          <Button type="button" variant="outline" disabled={pending || reading} onClick={onClose}>إغلاق</Button>
          <Button type="submit" disabled={pending || reading}>حفظ</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
