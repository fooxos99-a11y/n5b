import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import TeacherRecitationAction from '../../src/components/portal/TeacherRecitationAction';
import RecitationEndSelector from '../../src/components/portal/RecitationEndSelector';
import RecitationIdentity from '../../src/components/portal/RecitationIdentity';
import '../../src/index.css';
import '../../src/components/portal/recitation-reference.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
function Preview() {
  const [value, setValue] = useState({ surah: 58, surahName: 'المجادلة', ayah: 11 });
  const options = [10, 11, 12].map((ayah) => ({ surah: 58, surahName: 'المجادلة', ayah }));
  return <main className="p-3"><div className="recitation-reference recitation-students min-h-screen">
    {[1, 2, 3].map((id) => <div key={id} className="recitation-reference-card"><RecitationIdentity name={`طالب تجريبي ${id}`} /></div>)}
    <div className="recitation-reference-card"><RecitationIdentity name="طالب تجريبي 4" /><div className="recitation-actions" data-has-both-tracks="true">
      {['saved', 'link', 'review', 'mastery'].map((slot) => <TeacherRecitationAction key={slot} slot={slot} label={{ saved: 'حفظ', link: 'ربط', review: 'مراجعة', mastery: 'إتقان' }[slot]} active showAmount={slot !== 'link'} amount="المعارج 41 إلى نوح 10" amountControl={['saved', 'mastery'].includes(slot) ? <RecitationEndSelector compact start={{ surah: 58, surahName: 'المجادلة', ayah: 9 }} value={value} options={options} onChange={setValue} /> : null} />)}
    </div></div>
  </div></main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
