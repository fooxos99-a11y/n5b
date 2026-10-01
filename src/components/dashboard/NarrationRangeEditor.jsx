import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/dashboard/layout/ManagementPanel';
import SurahSearchSelect from '@/components/quran/SurahSearchSelect';
import AyahSearchSelect from '@/components/quran/AyahSearchSelect';
import { studentsApi } from '@/services/studentsApi';

const emptyRange = () => ({ startSurah: '', startAyah: '', endSurah: '', endAyah: '' });
export const narrationRangeLabel = (range, chapters) => {
  const name = number => chapters.find(chapter => Number(chapter.number) === Number(number))?.name || number;
  return `${name(range.startSurah)} ${range.startAyah} ← ${name(range.endSurah)} ${range.endAyah}`;
};

export default function NarrationRangeEditor({ chapters, initialRanges, onApply, onCancel, onDraftChange }) {
  const [ranges, setRanges] = useState(initialRanges?.length ? initialRanges : [emptyRange()]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const changeRanges = next => { setRanges(next); onDraftChange(next); };
  const update = (index, key, value) => changeRanges(ranges.map((range, at) => {
    if (at !== index) return range;
    return { ...range, [key]: value, ...(key.endsWith('Surah') ? { [key.replace('Surah', 'Ayah')]: '' } : {}), faces: undefined };
  }));
  const apply = async () => {
    setSaving(true); setError('');
    try {
      const normalized = await studentsApi.previewNarrationRanges(ranges);
      if (mounted.current) onApply(normalized);
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) setSaving(false); }
  };
  return <div className="space-y-4 rounded-xl border p-3">
    {ranges.map((range, index) => <fieldset key={index} disabled={saving} className="min-w-0 space-y-3 border-b pb-3">
      <legend className="mb-2 font-bold">المقطع {index + 1}</legend>
      {['start', 'end'].map(side => {
        const chapter = chapters.find(item => Number(item.number) === Number(range[`${side}Surah`]));
        const ayahs = Array.from({ length: Number(chapter?.ayahCount || 0) }, (_, at) => ({ ayah: at + 1 }));
        return <div key={side} className="grid min-w-0 grid-cols-2 gap-2">
          <FormField label={side === 'start' ? 'من سورة' : 'إلى سورة'}>
            <SurahSearchSelect value={String(range[`${side}Surah`])} chapters={chapters} onChange={value => update(index, `${side}Surah`, value)} />
          </FormField>
          <FormField label={side === 'start' ? 'من آية' : 'إلى آية'}>
            <AyahSearchSelect value={String(range[`${side}Ayah`])} ayahs={ayahs} onChange={value => update(index, `${side}Ayah`, value)} />
          </FormField>
        </div>;
      })}
      <Button type="button" variant="outline" disabled={ranges.length === 1} onClick={() => changeRanges(ranges.filter((_, at) => at !== index))}>حذف المقطع {index + 1}</Button>
    </fieldset>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={saving || ranges.length >= 30} onClick={() => changeRanges([...ranges, emptyRange()])}>إضافة مقطع</Button>
      <Button disabled={saving} onClick={apply}>{saving ? 'جارٍ حساب الأوجه' : 'اعتماد المقاطع'}</Button>
      <Button variant="ghost" disabled={saving} onClick={onCancel}>إلغاء</Button>
    </div>
  </div>;
}
