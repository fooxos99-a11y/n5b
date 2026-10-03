import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import GradingSettingsPanel from '../../src/components/dashboard/GradingSettingsPanel';
import TrackTestDialog from '../../src/components/dashboard/grades/TrackTestDialog';
import { Button } from '../../src/components/ui/button';
import { gradingApi } from '../../src/services/gradingApi';
import { normalizeGradingPolicy } from '../../shared/grading-policy.js';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local fixture only');
let policy = normalizeGradingPolicy({ trackSession: { segments: [{ source:'link',max:3 },{ source:'review',max:7 }] } });
gradingApi.getPolicy = async () => ({policy});
gradingApi.savePolicy = async value => { policy = normalizeGradingPolicy(value); return {policy}; };
gradingApi.prepareTrackTest = async () => {
  if (location.search.includes('missing')) throw new Error('لا يوجد مقدار مراجعة مقرر لهذا الطالب في الأسبوع المحدد.');
  return { attemptToken:'synthetic',segments:policy.trackSession.segments.map((segment,index) => ({ ...segment,
    range:{fromSurah:2,toSurah:2,fromAyah:index*10+1,toAyah:index*10+5,fromSurahName:'البقرة',toSurahName:'البقرة'} })) };
};
function Fixture() {
  const [open,setOpen] = useState(false), [result,setResult] = useState(null), [status,setStatus] = useState('');
  return <main dir="rtl" className="mx-auto max-w-4xl space-y-4 p-3 [font-family:var(--font-ui)]">
    <Button onClick={() => setOpen(true)}>اختبار الطالب التجريبي</Button><span role="status">{status}</span>
    {result && <p>تم حفظ {result.length} مقاطع: {result.map(row => row.warnings).join('، ')}</p>}
    <GradingSettingsPanel section="track" onStatusChange={setStatus} />
    {open && <TrackTestDialog student={{id:3,name:'طالب تجريبي'}} weekStart="2026-09-27" saving={false} onClose={() => setOpen(false)}
      onSave={(segments,token) => { if (token !== 'synthetic') throw new Error('Fixture token mismatch'); setResult(segments); setOpen(false); }} />}
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
