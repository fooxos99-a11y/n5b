import React, { useEffect, useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import StudentHomeProgress from './StudentHomeProgress';
import { Button } from '@/components/ui/button';
import LoadingIndicator from '@/components/ui/loading-indicator';
import { loadStudentMemorized } from '@/services/studentHomeService';
import { buildPlanMushafTarget, planTaskAmount } from '@/lib/studentPlan';

export default function StudentMemorized({ studentId, onRead, openJuzs, onJuzToggle }) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setState((value) => ({ ...value, loading: true, error: '' }));
    loadStudentMemorized(studentId).then((rows) => {
      if (active) setState({ loading: false, rows: Array.isArray(rows) ? rows : [], error: '' });
    }).catch(() => { if (active) setState({ loading: false, rows: [], error: 'تعذر تحميل المحفوظ.' }); });
    return () => { active = false; };
  }, [studentId, version]);
  if (state.loading) return <div className="student-home-loading"><LoadingIndicator /></div>;
  if (state.error) return <div className="student-home-error" role="alert"><p>{state.error}</p><Button variant="outline" onClick={() => setVersion((value) => value + 1)}>إعادة المحاولة</Button></div>;
  const visibleRows = state.rows.filter(juz => Number(juz.progressPercent) > 0 || juz.savedRanges?.length > 0);
  return <div className="student-home-memorized">
    {!visibleRows.length && <p className="student-home-empty">لا يوجد محفوظ مسجل حتى الآن.</p>}
    {visibleRows.map((juz) => <details key={juz.juz || juz.label} open={openJuzs?.[juz.juz || juz.label]} onToggle={(event) => { const open = event.currentTarget.open; onJuzToggle?.((current) => ({ ...current, [juz.juz || juz.label]: open })); }} className="student-home-juz">
      <summary><span><BookOpen size={19} />{juz.label}</span><span>{Number(juz.progressPercent || 0).toLocaleString('ar-SA-u-nu-latn')}٪<ChevronDown size={18} /></span><StudentHomeProgress value={juz.progressPercent} label={`تقدم ${juz.label}`} /></summary>
      <div className="student-home-saved-ranges">{juz.savedRanges?.length ? juz.savedRanges.map((range, index) => <Button variant="outline" key={`${range.fromSurah}:${range.fromAyah}:${index}`} onClick={() => onRead(buildPlanMushafTarget([range], 'محفوظي'))}><BookOpen size={17} /><span>{planTaskAmount(range)}</span></Button>) : <p className="student-home-empty">تفاصيل المحفوظ تحتاج إلى تحديث الاتصال.</p>}</div>
    </details>)}
  </div>;
}
