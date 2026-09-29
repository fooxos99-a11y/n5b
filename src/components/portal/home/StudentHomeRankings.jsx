import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import SectionTabs from '@/components/ui/section-tabs';
import LoadingIndicator from '@/components/ui/loading-indicator';
import StudentRankingList from './StudentRankingList';
import { loadStudentHomeRankings } from '@/services/studentHomeService';
import StudentHomeStatus from './StudentHomeStatus';

export default function StudentHomeRankings({ studentId, onReady }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState('students');
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let active = true;
    setError('');
    loadStudentHomeRankings().then((next) => { if (active) setState(next); }).catch(() => { if (active) setError('تعذر تحميل الترتيب.'); }).finally(() => { if (active) onReady?.(true); });
    return () => { active = false; };
  }, [version, onReady]);
  const items = [{ value: 'students', label: 'أفضل الطلاب', visible: state?.settings.studentRankingsVisible !== false }, { value: 'families', label: 'أفضل الحلقات', visible: state?.settings.familyRankingsVisible !== false }].filter((item) => item.visible);
  if (state && !items.length) return null;
  const selected = items.some((item) => item.value === tab) ? tab : items[0]?.value;
  const retry = <StudentHomeStatus message="تعذر تحديث الترتيب." onRetry={() => setVersion((value) => value + 1)} />;
  const panel = (key) => {
  if (state[key === 'students' ? 'studentError' : 'familyError']) {
    return retry;
  }
  return <StudentRankingList limit={expanded ? Infinity : 5} rows={state[key]} family={key === 'families'} studentId={studentId} showPoints={state.settings.rankingPointsVisible !== false} />;
};
  const _resolveConditional = () => {
    if (error) {
      return retry;
    }
    if (!state) {
      return <div className="student-home-loading"><LoadingIndicator /></div>;
    }
    return <>
      <SectionTabs className="student-home-rank-mobile" items={items} value={selected} onChange={setTab} label="الترتيب">{panel(selected)}</SectionTabs>
      <div className="student-home-rank-desktop">{items.map((item) => <article key={item.value}><h3>{item.label}</h3>{panel(item.value)}</article>)}</div>
      {items.some((item) => state[item.value].length > 5) && <Button variant="ghost" className="student-ranking-expand" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? 'عرض أقل' : 'عرض الكل'}</Button>}
    </>;
  };
  return <section className="student-home-rankings" aria-label="لوحة التميز"><h2><Trophy size={21} />لوحة التميز</h2>
    {_resolveConditional()}
  </section>;
}
