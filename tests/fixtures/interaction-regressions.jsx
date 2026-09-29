import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen } from 'lucide-react';
import DashboardShell from '../../src/components/dashboard/DashboardShell';
import { Button } from '../../src/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '../../src/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../src/components/ui/select';
import StudentStoreSection from '../../src/components/portal/StudentStoreSection';
import { useAccountLogout } from '../../src/hooks/useAccountLogout';
import '../../src/index.css';

function Harness() {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('long');
  const logout = useAccountLogout();
  return <DashboardShell
    sections={[{ key: 'long', label: 'صفحة طويلة', icon: BookOpen }]}
    activeSection={section}
    onSectionChange={setSection}
    onLogout={logout}
  >
    <Button onClick={() => setOpen(true)}>فتح نافذة الاختبار</Button>
    <StudentStoreSection />
    {Array.from({ length: 60 }, (_, index) => <p key={index} className="py-4">سطر الاختبار {index + 1}</p>)}
    <Button>نهاية الصفحة</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle>نافذة الاختبار</DialogTitle>
        <Select defaultValue="one">
          <SelectTrigger aria-label="اختيار الاختبار"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="one">الأول</SelectItem><SelectItem value="two">الثاني</SelectItem></SelectContent>
        </Select>
        {Array.from({ length: 35 }, (_, index) => <p key={index}>سطر النافذة {index + 1}</p>)}
        <Button onClick={() => setOpen(false)}>إغلاق النافذة</Button>
      </DialogContent>
    </Dialog>
  </DashboardShell>;
}

createRoot(document.getElementById('root')).render(<Harness />);
