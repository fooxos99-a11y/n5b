import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from '@/lib/router';
import { SiteProvider } from '@/site/SiteProvider';
import PublicRegistration from '@/pages/PublicRegistration';
import RegistrationRequestsSection from '@/components/dashboard/RegistrationRequestsSection';
import { Toaster } from '@/components/ui/toaster';
import { studentsApi } from '@/services/studentsApi';
import '@/index.css';
if (!import.meta.env.DEV || !['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('Local fixture only');
const parameters=new URLSearchParams(location.search);
const complexes=[{id:1,name:'مجمع النور'},{id:2,name:'مجمع الفرقان'},{id:3,name:'مجمع بلا حلقات'}];
const committees=[{id:7,name:'حلقة الفجر',complexId:1,complexName:'مجمع النور'},{id:8,name:'حلقة العصر',complexId:2,complexName:'مجمع الفرقان'}];
let requests=[{id:1,name:'طالب اختبار',age:12,createdAt:'2026-10-03',nationalId:'12345',guardianPhone:'',memorization:{items:[],juzs:[]},testResults:{},
  ...(parameters.has('legacy')?{}:{complexId:1,complexName:'مجمع النور',committeeId:7,committeeName:'حلقة الفجر'})}];
const capture=(payload)=>{document.getElementById('requests').textContent=JSON.stringify(payload);};
Object.assign(studentsApi,{
  getPublicRegistration:async()=>({enabled:!parameters.has('closed'),juzRanges:[],complexes,committees}),
  submitPublicRegistration:async payload=>{capture(payload);if(parameters.has('save-error'))throw new Error('تعذر حفظ الطلب التجريبي.');return {ok:true,id:1};},
  getRegistrationRequests:async()=>({registrationEnabled:true,requests}),getCommittees:async()=>committees,
  acceptRegistrationRequest:async(_id,payload)=>{capture(payload);if(parameters.has('save-error'))throw new Error('تعذر قبول الطلب التجريبي.');requests=[];return {ok:true};},
});
createRoot(document.getElementById('root')).render(<BrowserRouter><SiteProvider>{parameters.has('dashboard')
  ? <main dir="rtl" className="mx-auto max-w-5xl p-4"><RegistrationRequestsSection/><Toaster/></main>
  : <PublicRegistration/>}</SiteProvider></BrowserRouter>);
