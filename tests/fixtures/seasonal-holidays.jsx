import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import SeasonalHolidaysSetting from '@/components/dashboard/SeasonalHolidaysSetting';
import PlanScheduleSummary from '@/components/portal/PlanScheduleSummary';
import StudentTodayCard from '@/components/portal/home/StudentTodayCard';
import '@/index.css';
import '@/components/portal/home/student-home.css';
if (!import.meta.env.DEV || !['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
function Fixture() {
  const [holidays,setHolidays]=useState([{startDate:'2026-11-01',endDate:'2026-11-10'}]);
  return <main className="mx-auto max-w-3xl space-y-5 p-4" dir="rtl">
    <section className="rounded-xl border bg-card p-4"><h1 className="mb-3 font-bold">الإجازات الموسمية</h1><SeasonalHolidaysSetting holidays={holidays} onChange={setHolidays} /></section>
    {['behind','on_track','ahead'].map(paceStatus=><section key={paceStatus} className="rounded-xl border bg-card p-4"><PlanScheduleSummary plan={{baseEndDate:'2027-01-10',projectedEndDate:paceStatus==='behind'?'2027-01-20':paceStatus==='ahead'?'2026-12-31':'2027-01-10',paceStatus,delayedFaces:10,aheadFaces:10}} /></section>)}
    <div className="student-home"><StudentTodayCard model={{groups:[],percent:0,seasonalHoliday:true}} onRead={()=>{}} /></div>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
