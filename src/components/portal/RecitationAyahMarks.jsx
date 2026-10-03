import React, { useEffect, useMemo } from 'react';
import { preloadMushafFonts } from '@/lib/quranFonts';

const normalizeMarks = (marks = []) => {
  const groups = { mistake: [], lahn: [], warning: [], hesitation: [] };
  marks.forEach((mark, index) => {
    const type = ['warning', 'lahn', 'hesitation'].includes(mark.markType) ? mark.markType : 'mistake';
    const text = String(mark.selectedText || mark.textUthmani || '').trim();
    const notes = String(mark.notes || '').trim();
    if (!text && !notes) return;
    groups[type].push({
      key: mark.id || `${mark.startLocation || (mark.surah + ':' + mark.ayah)}-${mark.endLocation || ''}-${index}`,
      text,
      notes,
    });
  });
  return groups;
};

const RecitationAyahMarks = ({ marks = [], historical = false }) => {
  const grouped = useMemo(() => normalizeMarks(marks), [marks]);

  useEffect(() => {
    preloadMushafFonts([]).catch(() => {});
  }, []);

  const sections = [
    { key: 'mistake', label: 'الأخطاء', tone: 'text-red-600', border: 'border-red-500/20', background: 'bg-red-500/5' },
    { key: 'lahn', label: 'اللحن', tone: 'text-fuchsia-700 dark:text-fuchsia-300', border: 'border-fuchsia-500/20', background: 'bg-fuchsia-500/5' },
    { key: 'hesitation', label: 'الترددات', tone: 'text-sky-600', border: 'border-sky-500/20', background: 'bg-sky-500/5' },
    { key: 'warning', label: 'التنبيهات', tone: 'text-amber-600', border: 'border-amber-500/20', background: 'bg-amber-500/5' },
  ].filter((section) => grouped[section.key].length > 0);

  if (sections.length === 0) return null;

  return (
    <div className="grid gap-3 border-t border-primary/10 bg-background/55 p-3 sm:grid-cols-2" dir="rtl">
      {historical && (
        <div className="rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-bold text-muted-foreground sm:col-span-2">
          تحديدات محفوظة من المحاولة التفصيلية السابقة
        </div>
      )}
      {sections.map((section) => (
        <div key={section.key} className="min-w-0 space-y-2">
          <div className={`text-xs font-black ${section.tone}`}>{section.label}</div>
          {grouped[section.key].map((mark) => (
            <div key={mark.key} className={`min-w-0 rounded-lg border px-3 py-2 text-right ${section.border} ${section.background}`}>
              {mark.text && (
                <p
                  className="break-words text-lg font-normal leading-[2.25] text-foreground"
                  style={{ fontFamily: "'Uthmanic-Hafs', 'Amiri', serif" }}
                  translate="no"
                >
                  {mark.text}
                </p>
              )}
              {mark.notes && (
                <p className="mt-1 break-words text-xs font-semibold leading-relaxed text-muted-foreground">
                  <span className={section.tone}>ملاحظة:</span> {mark.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default RecitationAyahMarks;
