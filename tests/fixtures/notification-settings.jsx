import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import NotificationSettings from '@/components/dashboard/NotificationSettings';import {studentsApi} from '@/services/studentsApi';import '@/index.css';
studentsApi.getNotificationAdministrators=async()=>[{id:2,name:'إداري أول'},{id:3,name:'إداري ثان'}];
function Fixture(){const [settings,setSettings]=useState({memorizationExecutionSource:'student'});globalThis.notificationFixture=settings;return <main className="mx-auto max-w-4xl"><NotificationSettings settings={settings} setSettings={setSettings} executionReminderStudents={[]} toggleListValue={()=>{}}/></main>;}
createRoot(document.getElementById('root')).render(<Fixture/>);
