import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MAX_PASSING_RATINGS } from '../../../../shared/passing-ratings.js';

export default function PassingRatingsEditor({ ratings, errors, onChange }) {
  const update = (index, key, value) => onChange(ratings.map((row, position) => position === index ? { ...row, [key]: value } : row));
  const add = () => {
    let suffix = 1;
    while (ratings.some(row => row.label === `تقدير جديد ${suffix}`)) suffix++;
    const minimumPercentage = Array.from({ length: 101 }, (_, index) => 100 - index)
      .find(value => !ratings.some(row => row.minimumPercentage === value));
    onChange([...ratings, { label: `تقدير جديد ${suffix}`, minimumPercentage }]);
  };
  return <div className="space-y-4">
    <h3 className="text-sm font-black text-primary">التقديرات</h3>
    <p className="text-xs leading-6 text-muted-foreground">تُستخدم لتقدير نسبة الجزء والنسبة الإجمالية في نوعَي الاجتياز. حد الاجتياز مستقل عن التقدير، والتعديل يسري على الاختبارات الجديدة.</p>
    {ratings.map((row, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_6rem_auto] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_auto]">
      <div className="space-y-2">
        <Label htmlFor={`passing-rating-label-${index}`}>اسم التقدير {index + 1}</Label>
        <Input id={`passing-rating-label-${index}`} value={row.label} maxLength={60}
          aria-invalid={Boolean(errors[`ratings.${index}.label`])} aria-describedby={errors[`ratings.${index}.label`] ? `passing-rating-label-error-${index}` : undefined}
          onChange={event => update(index, 'label', event.target.value)} />
        {errors[`ratings.${index}.label`] && <p id={`passing-rating-label-error-${index}`} role="alert" className="text-xs text-destructive">{errors[`ratings.${index}.label`]}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`passing-rating-min-${index}`}>الحد الأدنى {index + 1} ٪</Label>
        <Input id={`passing-rating-min-${index}`} type="number" inputMode="decimal" min="0" max="100" step="0.01" value={row.minimumPercentage ?? ''}
          aria-invalid={Boolean(errors[`ratings.${index}.minimumPercentage`])} aria-describedby={errors[`ratings.${index}.minimumPercentage`] ? `passing-rating-min-error-${index}` : undefined}
          onChange={event => update(index, 'minimumPercentage', event.target.value === '' ? null : Number(event.target.value))} />
        {errors[`ratings.${index}.minimumPercentage`] && <p id={`passing-rating-min-error-${index}`} role="alert" className="text-xs text-destructive">{errors[`ratings.${index}.minimumPercentage`]}</p>}
      </div>
      <Button variant="ghost" size="icon" className="mt-7 min-h-11 min-w-11 text-destructive" aria-label={`حذف التقدير ${index + 1}`} onClick={() => onChange(ratings.filter((_, position) => position !== index))}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>)}
    {!ratings.length && <p className="text-sm text-muted-foreground">لا توجد تقديرات. ستظهر النسب فقط.</p>}
    {errors.ratings && <p role="alert" className="text-sm text-destructive">{errors.ratings}</p>}
    <Button variant="outline" className="min-h-11 gap-2" disabled={ratings.length >= MAX_PASSING_RATINGS} onClick={add}><Plus className="h-4 w-4" aria-hidden="true" />إضافة تقدير</Button>
  </div>;
}
