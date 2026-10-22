import React from 'react';
import { HIZB_STARTS } from '../../../shared/quran-hizbs.js';

/** Official juz boundary and actual learning order are intentionally separate. */
export default function AutomaticStageNote({ range, chapters = [] }) {
  if (!range.automatic || !range.stageJuz) return null;
  const boundary = HIZB_STARTS[(range.stageJuz - 2) * 2];
  if (!boundary) return null;
  const name = chapters.find(chapter => Number(chapter.number) === boundary.surah)?.name || boundary.surah;
  const next = HIZB_STARTS[range.stageJuz * 2];
  const upperSurah = next ? next.surah - (next.ayah === 1 ? 1 : 0) : 114;
  const earlier = Number(range.startSurah) < upperSurah || Number(range.startAyah) > 1;
  const advance = boundary.ayah > 1 && Number(range.endSurah) === boundary.surah && Number(range.endAyah) >= boundary.ayah;
  return <p className="text-xs leading-6 text-muted-foreground">
    بداية الجزء {range.stageJuz - 1} في المصحف: {name} {boundary.ayah}.
    {earlier && ' ويُستكمل مقدارهما بالمحفوظ المعتمد من المراحل السابقة.'}
    {advance && ` حفظ ${name} من 1 إلى ${boundary.ayah - 1} رصيد للمراحل التالية بعد اعتماد المعلم.`}
  </p>;
}
