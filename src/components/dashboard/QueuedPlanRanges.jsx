import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { FormField, FormGrid } from './layout/ManagementPanel';
import SurahSearchSelect from '@/components/quran/SurahSearchSelect';
import AyahSearchSelect from '@/components/quran/AyahSearchSelect';
import { studentsApi } from '@/services/studentsApi';

function RangeEndpoint({ side, range, chapters, pageMode, onChange, previousRanges }) {
  const [ayahs, setAyahs] = useState([]);
  const [error, setError] = useState('');
  const surah = range[`${side}Surah`];
  useEffect(() => {
    let active = true;
    setAyahs([]); setError('');
    if (surah && !pageMode) studentsApi.getQuranAyahs(surah)
      .then(rows => { if (active) setAyahs(rows); })
      .catch(reason => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [surah, pageMode]);
  if (pageMode) return <Select value={String(range[`${side}Page`] || '')} onValueChange={value => onChange({ [`${side}Page`]: value })}>
    <SelectTrigger aria-label={side === 'start' ? 'بداية الخطة التالية' : 'نهاية الخطة التالية'}><SelectValue placeholder="الصفحة" /></SelectTrigger>
    <SelectContent>{Array.from({ length: 604 }, (_, index) => <SelectItem key={index} value={String(index + 1)}>{index + 1}</SelectItem>)}</SelectContent>
  </Select>;
  return <div className="space-y-2">
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_108px]">
      <SurahSearchSelect value={String(surah || '')} chapters={side === 'start' ? chapters.filter(chapter => !previousRanges.some(item => Number(item.startSurah) === Number(chapter.number))) : chapters} allChapters={chapters} onChange={value => onChange({ [`${side}Surah`]: value, [`${side}Ayah`]: '', [`${side}Page`]: '' })} />
      <AyahSearchSelect value={String(range[`${side}Ayah`] || '')} ayahs={ayahs} onChange={value => onChange({ [`${side}Ayah`]: value })} />
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

export default function QueuedPlanRanges({ value = [], onChange, chapters, pageMode, currentRange }) {
  return <div className="space-y-3 border-t border-border pt-4">
    {value.map((range, index) => <div key={index} className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-2"><span className="text-sm font-bold">الخطة التالية {index + 1}</span>
        <ManagementIconButton aria-label={`إزالة الخطة التالية ${index + 1}`} onClick={() => onChange(value.filter((_, item) => item !== index))}><Trash2 className="h-4 w-4" /></ManagementIconButton>
      </div>
      <FormGrid>{['start', 'end'].map(side => <FormField key={side} label={side === 'start' ? 'بداية الخطة' : 'نهاية الخطة'}>
        <RangeEndpoint side={side} range={range} chapters={chapters} pageMode={pageMode} previousRanges={[currentRange, ...value.slice(0, index)]} onChange={patch => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))} />
      </FormField>)}</FormGrid>
    </div>)}
    <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => onChange([...value, {}])}><Plus className="h-4 w-4" />إضافة خطة</Button>
  </div>;
}
