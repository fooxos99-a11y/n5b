import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import NarrationStudentPanel from '@/components/dashboard/NarrationStudentPanel';
import { studentsApi } from '@/services/studentsApi';
import '@/index.css';
globalThis.narrationFixture = { saves: [], loads: [], fail: false };
studentsApi.getNarrationPartAyahs = async (eventId, partId) => { globalThis.narrationFixture.loads.push({ eventId, partId }); return { pages: [] }; };
function Fixture() {
 const [parts,setParts]=useState([
  {id:51,juzNumber:5,startSurah:4,startAyah:24,startSurahName:'النساء',endSurah:4,endAyah:40,endSurahName:'النساء',score:null,warningCount:0,mistakeCount:0},
  {id:52,juzNumber:5,startSurah:4,startAyah:100,startSurahName:'النساء',endSurah:4,endAyah:120,endSurahName:'النساء',score:null,warningCount:0,mistakeCount:0},
 ]);
 const saveJuz=async(entryId,juzNumber,payload)=>{
  if(globalThis.narrationFixture.fail){throw new Error('حفظ غير متاح');}
  globalThis.narrationFixture.saves.push({entryId,juzNumber,...payload});
  setParts(rows=>rows.map((row,index)=>row.juzNumber===juzNumber?{...row,score:90,warningCount:index===0?payload.warningCount:0,mistakeCount:index===0?payload.mistakeCount:0}:row));
  return {};
 };
 return <NarrationStudentPanel eventId={7} student={{id:4,studentName:'طالب تجريبي',committeeName:'حلقة تجريبية',status:'active',totalFaces:20,parts}} archived={false} onStart={()=>{}} onSaveJuz={saveJuz} />;
}
createRoot(document.getElementById('root')).render(<Fixture />);
