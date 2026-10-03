import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import NarrationCreateDialog from '../../src/components/dashboard/NarrationCreateDialog';
import { studentsApi } from '../../src/services/studentsApi';
import { Button } from '../../src/components/ui/button';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost','127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
const committees = [{id:1,name:'الفجر',complexId:1,complexName:'مجمع الفجر'}, {id:2,name:'الضحى',complexId:1,complexName:'مجمع الفجر'}, {id:3,name:'العصر',complexId:2,complexName:'مجمع العصر'}];
studentsApi.getNarrationPreparation = async () => committees.map(committee => ({id:committee.id,name:`طالب ${committee.name}`,committeeId:committee.id,committeeName:committee.name}));
studentsApi.getQuranChapters = async () => [{number:1,name:'الفاتحة',ayahCount:7,startPage:1,endPage:1}];
function Fixture() {
  const [open,setOpen] = useState(true), [result,setResult] = useState(null);
  return <main dir="rtl" className="p-3"><Button onClick={() => setOpen(true)}>فتح السرد التجريبي</Button>
    {result && <p>حلقات السرد: {result.committeeIds.join('، ')}</p>}
    <NarrationCreateDialog open={open} onOpenChange={setOpen} committees={committees} onCreate={async value => setResult(value)} />
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
