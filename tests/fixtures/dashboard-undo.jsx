import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DashboardUndoNotice from '../../src/components/dashboard/DashboardUndoNotice';
import { Button } from '../../src/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '../../src/components/ui/dialog';
import { request } from '../../src/services/studentsApi';
import '../../src/index.css';

if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local test only');
function Fixture() {
  const [result, setResult] = useState('');
  const [open, setOpen] = useState(true);
  const save = async () => {
    try { await request('/programs/1', { method: 'DELETE' }); setResult('نفذ'); }
    catch (error) { setResult(error.message); }
  };
  return <>
    <DashboardUndoNotice active />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>تعديل البرنامج</DialogTitle>
        <Button onClick={save}>حذف البرنامج</Button>
        <output>{result}</output>
      </DialogContent>
    </Dialog>
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
