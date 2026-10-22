import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { automaticPlanApi } from '@/services/automaticPlanApi';

export default function AutomaticPlanControl({ studentId, currentPlanId, priorMemorization, disabled, onApply, onPriorSaved }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [priorOnly, setPriorOnly] = useState(false);
  const [generated, setGenerated] = useState(false);
  const generate = async () => {
    setBusy(true); setPriorOnly(false); setGenerated(false);
    try {
      const { template } = await automaticPlanApi.loadTemplate();
      const result = await automaticPlanApi.preview(studentId, { ranges: template.ranges, currentPlanId, priorMemorization });
      if (!result.ranges.length && !currentPlanId) {
        setPriorOnly(priorMemorization.length > 0);
        toast({ title: 'لا خطط متبقية' });
        return;
      }
      onApply(result.ranges);
      setGenerated(result.ranges.some(range => range.stageJuz));
    } catch (error) { toast({ title: 'تعذر إضافة الخطط', description: error.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return <>
    <Button type="button" variant="outline" className="min-h-11" disabled={disabled || busy} onClick={generate}>
      {busy ? 'جارٍ الإضافة…' : 'إضافة الخطط تلقائيًا'}
    </Button>
    {generated && <p className="text-xs leading-6 text-muted-foreground">الحفظ بالترتيب داخل السورة. ويُحتسب ما يسبق حدود المرحلة رصيدًا للمرحلة التالية بعد اعتماد المعلم.</p>}
    {priorOnly && <Button type="button" variant="outline" disabled={disabled || busy} onClick={async () => {
      setBusy(true);
      try { await automaticPlanApi.savePrior(studentId, priorMemorization); onPriorSaved(); }
      catch (error) { toast({ title: 'تعذر حفظ المحفوظ', description: error.message, variant: 'destructive' }); }
      finally { setBusy(false); }
    }}>حفظ المحفوظ فقط</Button>}
  </>;
}
