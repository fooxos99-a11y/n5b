import WeeklySessionSection from '@/components/dashboard/grades/WeeklySessionSection';
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import CallsSection from '@/components/calls/CallsSection';
import SupervisorsSection from '@/components/dashboard/SupervisorsSection';
import TrackSessionSection from '@/components/dashboard/grades/TrackSessionSection';
import { ManagementPanel, ManagementTabs } from '@/components/dashboard/layout/ManagementPanel';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';
import { studentsApi } from '@/services/studentsApi';
import { gradingApi } from '@/services/gradingApi';
import { normalizeGradingPolicy, gradingMaxima } from '../../shared/grading-policy.js';
import { evaluateTrackSession } from '../../shared/grading-engine.js';
import { getBusinessDate, shiftDateOnly } from '../../shared/business-date.js';
import '@/index.css';

if (!import.meta.env.DEV || !['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const today=getBusinessDate(), weekStart=shiftDateOnly(today,-new Date(`${today}T00:00:00Z`).getUTCDay());
const policy=normalizeGradingPolicy({ trackSession: { sessionDay: new Date(`${today}T00:00:00Z`).getUTCDay() }, weeklySession: { sessionDay: new Date(`${today}T00:00:00Z`).getUTCDay() } });
const circles=[{id:1,name:'حلقة الاختبار',complexId:1}];
const staff=[{id:7,name:'مشرف مسار الاختبار',loginNumber:'12345',committeeIds:['1'],permissions:['trackSession']}];
const students=[{id:3,name:'أحمد طالب الاختبار',committeeName:'حلقة الاختبار',compensations:[],grade:{trackDetail:evaluateTrackSession(policy,{attendanceStatus:'present',segments:[{recorded:false},{recorded:false}]}),trackSession:{grade:10,max:30}}},
  {id:4,name:'محمد المستأذن',committeeName:'حلقة الاختبار',compensations:[],grade:{trackDetail:evaluateTrackSession(policy,{attendanceStatus:'excused',segments:[]}),trackSession:{grade:0,max:30}}}];
Object.assign(studentsApi, {getCommittees:async()=>circles,getSupervisors:async()=>structuredClone(staff),updateSupervisor:async(id,form)=>{Object.assign(staff.find(row=>row.id===id),form);return{ok:true};}});
const compensationDays = (student, scope) => student.id === 4 ? [
  { date: shiftDateOnly(today, -7), dayNumber: 1 }, { date: today, dayNumber: 8 },
].filter(day => !student.compensations.some(row => row.scope === scope && !row.cancelledAt && row.date === day.date)) : [];
Object.assign(gradingApi, {
  getCompensationDays: async ({ studentId, scope }) => ({ days: compensationDays(students.find(student => student.id === studentId), scope) }),
  getPolicy:async()=>({policy,maxima:gradingMaxima(policy)}),
  getWeek:async()=>({canManageCompensations:true,weekStart,weekEnd:shiftDateOnly(weekStart,6),dates:Array.from({length:7},(_,i)=>shiftDateOnly(weekStart,i)),policy,maxima:gradingMaxima(policy),students:structuredClone(students.map(student => ({ ...student, compensationDays: { track: compensationDays(student, 'track'), program: compensationDays(student, 'program') } })))}),
  approveExcuse:async()=>({ok:true}),
  cancelCompensation:async(id,reason)=>{const student=students.find(row=>row.compensations.some(item=>item.id===id));const row=student.compensations.find(item=>item.id===id);row.cancelledAt=today+'T13:00:00';row.cancelledByName='مدير الاختبار';row.cancellationReason=reason;if(row.scope==='track'){student.grade.trackDetail=row.before;student.grade.trackSession={grade:row.before.grade,max:row.before.max};}return{ok:true};},
  compensateDay:async({studentId,date,excuseReference,scope})=>{
    const student=students.find(row=>row.id===studentId);
    if(student.compensations.some(row=>row.scope===scope&&!row.cancelledAt&&row.date===date))throw new Error('تم تعويض هذا اليوم مسبقًا.');
    const id=students.reduce((sum,item)=>sum+item.compensations.length,1);const before=structuredClone(student.grade.trackDetail);if(scope==='track'){const detail=evaluateTrackSession(policy,{attendanceStatus:'present'});detail.attendanceStatus=before.attendanceStatus;detail.attended=before.attended;detail.attendanceGrade=before.attendanceGrade;detail.segments=detail.segments.map(item=>({...item,recorded:false,compensated:true,grade:item.max}));detail.grade=before.attendanceGrade+detail.segments.reduce((sum,item)=>sum+item.grade,0);detail.operationType='compensation';student.grade.trackDetail=detail;student.grade.trackSession={grade:detail.grade,max:detail.max};}
    student.compensations.push({id,scope,before,date,actorName:'مشرف مسار الاختبار',recordedAt:`${today}T12:30:00`,excuseReference});return{ok:true};
  },
});
const rooms=[
  {id:'1',name:'مكالمة أحمد — الحلقة الأولى',committeeName:'حلقة الاختبار',status:'open',studentPresent:true,participants:[{name:'أحمد',role:'student'},{name:'مشرف المسار',role:'supervisor'}]},
  {id:'2',name:'مكالمة محمد',committeeName:'حلقة الاختبار',status:'open',studentPresent:false,participants:[{name:'المقرئ خالد',role:'supervisor'}]},
  {id:'3',name:'مكالمة عبدالله',committeeName:'حلقة الاختبار',status:'open',studentPresent:false,participants:[]},
];
const directory=()=>({rooms:structuredClone(rooms),committees:circles,canCreate:false,livekitConfigured:true});
studentsApi.getCallRooms=async()=>directory();
let eventController;
const originalFetch=window.fetch;
window.fetch=async(input,options)=>{
  if(!String(input).endsWith('/calls/events'))return originalFetch(input,options);
  return new Response(new ReadableStream({start(controller){eventController=controller;controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(directory())}\n\n`));options.signal.addEventListener('abort',()=>{controller.close();eventController=null;},{once:true});}}),{headers:{'content-type':'text/event-stream'}});
};
const updatePresence=present=>{
  rooms[1].studentPresent=present;
  rooms[1].participants=present?[{name:'محمد',role:'student'},{name:'المقرئ خالد',role:'supervisor'}]:[{name:'المقرئ خالد',role:'supervisor'}];
  eventController?.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(directory())}\n\n`));
};
function Fixture(){
  const [tab,setTab]=useState('calls'),[joined,setJoined]=useState('');
  return <main dir="rtl" className="mx-auto max-w-6xl space-y-4 p-3 sm:p-6 [font-family:var(--font-ui)]">
    <ManagementPanel><ManagementTabs label="فحص الواجهات" value={tab} onChange={setTab} items={[{value:'calls',label:'المكالمات'},{value:'permissions',label:'مشرفو المسارات'},{value:'compensation',label:'جلسة المسار'},{value:'program',label:'البرنامج الأسبوعي'}]} /></ManagementPanel>
    {tab==='calls'?<><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>updatePresence(true)}>دخول محمد التجريبي</Button><Button variant="outline" onClick={()=>updatePresence(false)}>خروج محمد التجريبي</Button></div><CallsSection onJoinRoom={room=>setJoined(room.name)} /><p role="status">{joined&&`تم اختيار ${joined}`}</p></>:tab==='permissions'?<SupervisorsSection />:tab==='program'?<WeeklySessionSection />:<TrackSessionSection />}
    <Toaster />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
