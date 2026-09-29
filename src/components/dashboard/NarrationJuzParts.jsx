import React from 'react';
import { Button } from '@/components/ui/button';
import { narrationRangeLabel } from '@/lib/narrationParts';

export default function NarrationJuzParts({ groups, archived, onRecite, onShowErrors, maxScore = 100 }) {
  return <div className="divide-y divide-border [font-family:var(--font-ui)]" dir="rtl">
    {groups.map(group => <section key={group.juzNumber} aria-label={`الجزء ${group.juzNumber}`} className="py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-black text-primary">الجزء {group.juzNumber}</h3>
        <span className="text-xs font-bold text-muted-foreground">
          {group.evaluated ? `${Number(group.score).toFixed(1)} من ${maxScore}` : 'لم يُقيّم'}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <ul className="min-w-0 space-y-1 text-sm font-bold" aria-label={`مقاطع الجزء ${group.juzNumber}`}>
          {group.parts.map(part => <li key={part.id} className="break-words">{narrationRangeLabel(part)}</li>)}
        </ul>
        <Button type="button" size="sm" className="shrink-0" onClick={() => archived ? onShowErrors(group) : onRecite(group)}>
          {archived ? 'عرض الأخطاء' : 'بدأ التسميع'}
        </Button>
      </div>
    </section>)}
  </div>;
}
