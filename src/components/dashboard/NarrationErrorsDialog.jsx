import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DashboardLoader from './DashboardLoader';

export default function NarrationErrorsDialog({ group, onClose, loadPart }) {
  const [ayahs, setAyahs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!group) return;
    let active = true;
    setAyahs([]);
    setError('');
    const marked = group.parts.filter(part => part.wordMarks?.length);
    setLoading(marked.length > 0);
    Promise.all(marked.map(loadPart)).then(results => {
      if (active) setAyahs(results.flatMap(result => result.ayahs || []));
    }).catch(cause => { if (active) setError(cause.message || 'تعذر تحميل الآيات.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [group, loadPart]);
  const marks = group?.parts.flatMap(part => part.wordMarks || []) || [];
  const lahns = marks.filter(mark => mark.markType === 'lahn').length;
  const sections = [
    { type: 'mistake', title: 'الأخطاء', count: Math.max(0, (group?.mistakeCount || 0) - lahns) },
    { type: 'lahn', title: 'اللحون', count: lahns },
    { type: 'hesitation', title: 'الترددات', count: group?.hesitationCount || 0 },
    { type: 'warning', title: 'التنبيهات', count: group?.warningCount || 0 },
  ];
  return <Dialog open={Boolean(group)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent dir="rtl" className="max-h-[85dvh] max-w-2xl overflow-y-auto bg-card [font-family:var(--font-ui)]">
      <DialogHeader><DialogTitle>عرض الأخطاء — الجزء {group?.juzNumber}</DialogTitle></DialogHeader>
      {loading ? <DashboardLoader className="min-h-32" /> : <>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {sections.map(section => <section key={section.type} className="space-y-2 border-b border-border pb-3">
          <h3 className="font-bold">{section.title}: {section.count}</h3>
          {marks.filter(mark => mark.markType === section.type).map((mark, index) => {
            const [surah, ayah] = String(mark.startLocation || `${mark.surah}:${mark.ayah}`).split(':').map(Number);
            const [endSurah, endAyah] = String(mark.endLocation || mark.startLocation || `${surah}:${ayah}`).split(':').map(Number);
            const verses = ayahs.filter(verse => (verse.surah * 1000 + verse.ayah) >= surah * 1000 + ayah
              && (verse.surah * 1000 + verse.ayah) <= endSurah * 1000 + endAyah);
            return <div key={index} className="rounded-lg bg-muted/30 p-3">
              {verses.length ? verses.map(verse => <p key={`${verse.surah}:${verse.ayah}`} className="break-words text-lg leading-loose">{verse.textUthmani} <span className="text-sm text-muted-foreground">({verse.surah}:{verse.ayah})</span></p>)
                : <p className="break-words leading-loose">{mark.selectedText || mark.textUthmani}</p>}
              {mark.notes && <p className="text-sm text-muted-foreground">{mark.notes}</p>}
            </div>;
          })}
        </section>)}
      </>}
      <Button variant="outline" onClick={onClose}>إغلاق</Button>
    </DialogContent>
  </Dialog>;
}
