import React from 'react';
import { createRoot } from 'react-dom/client';
import QuranExecutionDialog from '../../src/components/portal/QuranExecutionDialog';
import StoreSection from '../../src/components/dashboard/StoreSection';
import { studentsApi } from '../../src/services/studentsApi';
import { Toaster } from '../../src/components/ui/toaster';
import '../../src/index.css';

if (!import.meta.env.DEV || !['127.0.0.1','localhost'].includes(location.hostname)) throw new Error('Local fixture only');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const tasks = ['memorization','review','link'].map((taskType,i) => ({id:i+1,taskType,fromPage:1,toPage:1,fromSurah:1,toSurah:1,fromAyah:1,toAyah:2,fromSurahName:'الفاتحة',toSurahName:'الفاتحة',studentStatus:null}));
let reads=0;
window.fixture={writes:[],storeReads:0};
studentsApi.getStudentQuranToday=async()=>{
 if (++reads>1) await delay(800);
 return {date:'2026-09-09',plan:{id:1},tasks:structuredClone(tasks)};
};
studentsApi.updateStudentQuranTasksExecution=async(id,payload)=>{
 window.fixture.writes.push(payload);
 await delay(200);
 if (payload.taskIds.includes(3)) throw new Error('فشل تجريبي');
 tasks.forEach(task=>{if(payload.taskIds.includes(task.id))task.studentStatus=payload.status;});
 return {ok:true};
};
const product={id:1,name:'منتج تجريبي',imageData:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',pointsPrice:10,stock:5,isActive:true};
studentsApi.getStoreConfiguration=async()=>({storeEnabled:true,pointsSystemEnabled:true});
studentsApi.getStoreProducts=async()=>{window.fixture.storeReads++;return {products:[product]};};
studentsApi.getStoreOrders=async()=>[];
studentsApi.updateStoreProduct=async(id,payload)=>{await delay(300);return {...payload,id};};
createRoot(document.getElementById('root')).render(<><QuranExecutionDialog studentId={1} inline compact/><StoreSection/><Toaster/></>);
