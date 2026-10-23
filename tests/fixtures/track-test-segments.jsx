import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import GradingSettingsPanel from '../../src/components/dashboard/GradingSettingsPanel';
import TrackTestDialog from '../../src/components/dashboard/grades/TrackTestDialog';
import { Button } from '../../src/components/ui/button';
import { gradingApi } from '../../src/services/gradingApi';
import { normalizeGradingPolicy } from '../../shared/grading-policy.js';
import { getOfflineMushafPage } from '../../src/services/offlineMushaf';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local fixture only');
let policy = normalizeGradingPolicy({ trackSession: { segments: [{ source:'link',max:3 },{ source:'review',max:7 }] } });
gradingApi.getPolicy = async () => ({policy});
gradingApi.savePolicy = async value => { policy = normalizeGradingPolicy(value); return {policy}; };
let draft;
let revision = 0;
let mushafLoads = 0;
gradingApi.getTrackTestMushaf = async ({ attemptToken, segmentIndex }) => {
  if (attemptToken !== draft.attemptToken) throw new Error('Fixture token mismatch');
  if (location.search.includes('load-failure') && mushafLoads++ === 0) throw new Error('تعذر تحميل المصحف التجريبي.');
  const range = draft.segments[segmentIndex].range;
  const pages = (await Promise.all(Array.from({ length: 9 }, (_, index) => getOfflineMushafPage(index + 2))))
    .filter(page => page.words.some(word => {
      const [surah,ayah] = word.verseKey.split(':').map(Number);
      return surah === 2 && ayah >= range.fromAyah && ayah <= range.toAyah;
    }));
  return { pages, allowedRange:range, wordMarks:[] };
};
gradingApi.prepareTrackTest = async ({ attemptToken, segmentIndex }) => {
  if (location.search.includes('missing')) throw new Error('لا يوجد مقدار مراجعة مقرر لهذا الطالب في الأسبوع المحدد.');
  if (attemptToken !== undefined) {
    if (attemptToken !== draft.attemptToken) throw new Error('Fixture token mismatch');
    await new Promise(resolve => setTimeout(resolve, 1500));
    if (location.search.includes('failure')) throw new Error('تعذر تغيير المقطع. حاول مرة أخرى.');
    draft = { attemptToken:`synthetic-${++revision}`, segments:draft.segments.map((segment,index) => index !== segmentIndex ? segment
      : { ...segment, range:{ ...segment.range, fromAyah:segment.range.fromAyah+20, toAyah:segment.range.toAyah+20 } }) };
  } else {
    revision = 0;
    draft = { attemptToken:'synthetic-0',segments:policy.trackSession.segments.map((segment,index) => ({ ...segment,
      canReplace:!location.search.includes('unavailable'),
      range:{fromSurah:2,toSurah:2,fromAyah:index*10+1,toAyah:index*10+5,fromSurahName:'البقرة',toSurahName:'البقرة'} })) };
  }
  return draft;
};
function Fixture() {
  const [open,setOpen] = useState(false), [result,setResult] = useState(null), [status,setStatus] = useState('');
  const [saving,setSaving] = useState(false), [saveCount,setSaveCount] = useState(0);
  return <main dir="rtl" className="mx-auto max-w-4xl space-y-4 p-3 [font-family:var(--font-ui)]">
    <Button onClick={() => setOpen(true)}>اختبار الطالب التجريبي</Button><span role="status">{status}</span>
    <output aria-label="عدد طلبات الحفظ">{saveCount}</output>
    {result && <p>تم حفظ {result.length} مقاطع: {result.map(row => row.warnings).join('، ')}</p>}
    {result && <pre aria-label="نتيجة الاختبار">{JSON.stringify(result)}</pre>}
    <GradingSettingsPanel section="track" onStatusChange={setStatus} />
    {open && <TrackTestDialog student={{id:3,name:'طالب تجريبي'}} weekStart="2026-09-27" saving={saving} onClose={() => setOpen(false)}
      onSave={async (segments,token) => {
        if (token !== draft.attemptToken) throw new Error('Fixture token mismatch');
        setSaving(true); setSaveCount(count => count + 1);
        try {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (saveCount === 0 && location.search.includes('save-failure')) return false;
          if (saveCount === 0 && location.search.includes('save-throw')) throw new Error('تعذر حفظ العلامات التجريبية. حاول مرة أخرى.');
          setResult(segments); setOpen(false); return true;
        } finally { setSaving(false); }
      }} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
