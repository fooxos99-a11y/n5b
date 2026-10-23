import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormGrid } from './layout/ManagementPanel';
import SurahSearchSelect from '@/components/quran/SurahSearchSelect';
import AyahSearchSelect from '@/components/quran/AyahSearchSelect';
import { studentsApi } from '@/services/studentsApi';

function RangeEndpoint({ side, range, chapters, pageMode, onChange }) {
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
  if (pageMode && range.automatic !== true) return <Select value={String(range[`${side}Page`] || '')} onValueChange={value => onChange({ [`${side}Page`]: value, automatic: false, [`${side}Surah`]: '', [`${side}Ayah`]: '' })}>
    <SelectTrigger aria-label={side === 'start' ? 'بداية الخطة التالية' : 'نهاية الخطة التالية'}><SelectValue placeholder="الصفحة" /></SelectTrigger>
    <SelectContent>{Array.from({ length: 604 }, (_, index) => <SelectItem key={index} value={String(index + 1)}>{index + 1}</SelectItem>)}</SelectContent>
  </Select>;
  return <div className="space-y-2">
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_108px]">
      <SurahSearchSelect value={String(surah || '')} chapters={chapters} allChapters={chapters} onChange={value => onChange({ [`${side}Surah`]: value, [`${side}Ayah`]: '', [`${side}Page`]: '', automatic: false, stageJuz: undefined, label: undefined })} />
      <AyahSearchSelect value={String(range[`${side}Ayah`] || '')} ayahs={ayahs} onChange={value => onChange({ [`${side}Ayah`]: value, automatic: false, stageJuz: undefined, label: undefined })} />
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}

export default function QueuedPlanRanges({ value = [], onChange, chapters, pageMode }) {
  return <div className="space-y-3 border-t border-border pt-4">
    {value.map((range, index) => <div key={index} className="space-y-2 rounded-xl border border-border p-3">
      <div className="text-sm font-bold">الخطة التالية {index + 1}</div>
      <FormGrid>{['start', 'end'].map(side => <FormField key={side} label={side === 'start' ? 'من' : 'إلى'}>
        <RangeEndpoint side={side} range={range} chapters={chapters} pageMode={pageMode} onChange={patch => onChange(value.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))} />
      </FormField>)}</FormGrid>
    </div>)}
    <Button type="button" variant="outline" className="min-h-11 gap-2" onClick={() => onChange([...value, {}])}><Plus className="h-4 w-4" />إضافة خطة</Button>
  </div>;
}
