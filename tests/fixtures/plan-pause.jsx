import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import StudentPlansSection from '@/components/dashboard/StudentPlansSection';
import StudentTodayCard from '@/components/portal/home/StudentTodayCard';
import { studentHomePlan } from '@/lib/studentHome';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { studentsApi } from '@/services/studentsApi';
import { getBusinessDate, shiftDateOnly } from '../../shared/business-date.js';
import { changeStudentPlanPause, parseStudentPlanPause, studentPlanPauseStatus } from '../../shared/student-plan-pause.js';
import '@/index.css';
import '@/components/portal/home/student-home.css';
if (!import.meta.env.DEV || !['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('Local fixture only');
const options = new URLSearchParams(location.search), date = getBusinessDate();
let pause = parseStudentPlanPause();
if(options.has('readonly')) pause = changeStudentPlanPause(pause,{paused:true,revision:0,date:shiftDateOnly(date,-3)});
let failLoad = options.has('load-error'), stale = options.has('stale');
const state = () => ({...studentPlanPauseStatus(pause),canManage:!options.has('readonly')});
const plan={id:17,track:'memorization',trackLabel:'حفظ',startDate:date,startPage:1,endPage:49,startSurah:1,startAyah:1,endSurah:2,endAyah:286,
  dailyPages:1,linkPages:10,reviewHizbs:1,readingHizbs:2,progressPercent:50,projectedEndDate:'2026-12-01',delayedFaces:5,paceStatus:'behind',priorMemorization:[],queuedRanges:[]};
Object.assign(studentsApi,{
  getStudentPlanPause:async()=>{if(failLoad){failLoad=false;throw new Error('تعذر تحميل الحالة التجريبية.');}return state();},
  setStudentPlanPause:async payload=>{
    if(options.has('save-error'))throw Object.assign(new Error('تعذر حفظ الحالة التجريبية.'),{status:503});
    if(stale){stale=false;pause=changeStudentPlanPause(pause,{...payload,date});throw Object.assign(new Error('تغيّرت حالة الخطط. حدّث الصفحة وحاول مجددًا.'),{status:409});}
    pause=changeStudentPlanPause(pause,{...payload,date});return state();
  },
  getCommittees:async()=>[{id:7,name:'حلقة الاختبار'}],
  getStudentPlans:async()=>[{studentId:3,studentName:'طالب اختبار',committeeName:'حلقة الاختبار',plan}],
  getQuranChapters:async()=>[],getQuranJuzRanges:async()=>[],
  getPublicSettings:async()=>({quranReferenceMode:'page'}),
});
function Fixture(){
  const [version,setVersion]=useState(0);
  return <main dir="rtl" className="mx-auto max-w-5xl space-y-4 p-4">
    <Button variant="outline" onClick={()=>setVersion(current=>current+1)}>إعادة فتح الصفحة</Button>
    <StudentPlansSection key={version}/>
    <div className="student-home"><StudentTodayCard model={studentHomePlan({date,isPlanPaused:state().paused,tasks:[]},date)} onRead={()=>{}}/></div>
    <Toaster/>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
