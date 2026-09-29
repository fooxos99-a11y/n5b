import React, { useEffect, useState } from 'react';
import { getOfflineMushafPage } from '@/services/offlineMushaf';
import { preloadMushafFonts } from '@/lib/quranFonts';

export default function QuranMarkedText({ mark }) {
  const text = mark.selectedText || mark.textUthmani || '';
  const [glyphs, setGlyphs] = useState(null);
  useEffect(() => {
    let active = true;
    setGlyphs(null);
    const load = async () => {
      const page = Number(mark.page);
      const ready = await preloadMushafFonts(page ? [page] : []);
      if (!page || !mark.startLocation || !mark.endLocation || !ready) return;
      try {
        const data = await getOfflineMushafPage(page);
        const words = data.words || [];
        const start = words.findIndex((word) => word.location === mark.startLocation);
        const end = words.findIndex((word) => word.location === mark.endLocation);
        if (start < 0 || end < start) return;
        const selected = words.slice(start, end + 1).filter((word) => word.charType === 'word');
        if (active && selected.length && selected.every((word) => word.codeV2)) setGlyphs(selected.map((word) => word.codeV2).join(' '));
      } catch {
        // The stored selection remains readable in the bundled Uthmanic font offline.
        if (active) setGlyphs(null);
      }
    };
    void load();
    return () => { active = false; };
  }, [mark.page, mark.startLocation, mark.endLocation]);
  return <span className="student-plan-feedback-quran" translate="no" aria-label={text} style={{ fontFamily: glyphs ? `QCF-P${Number(mark.page)}` : "'Uthmanic-Hafs', 'Amiri', serif" }}>{glyphs || text}</span>;
}
