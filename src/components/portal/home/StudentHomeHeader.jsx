import NotificationButton from '@/components/notifications/NotificationButton';
import ThemeToggle from '@/components/ThemeToggle';
import React, { useState } from 'react';
import { CalendarDays, LogOut, PhoneCall, ShoppingBag, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import RankingPointsValue from '@/components/points/RankingPointsValue';
import StudentHomeProgress from './StudentHomeProgress';

export default function StudentHomeHeader({ points, progress, progressLabel, levelName, studentName, showProgress = true, storeEnabled, onOpen, onLogout }) {
  const [open, setOpen] = useState(false);
  const select = (key) => { setOpen(false); onOpen(key); };
  return <header className="student-home-header"><div className="student-home-header-inner">
    <div className="student-home-account-group"><Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button variant="ghost" className="student-home-level !text-white" aria-label="قائمة حساب الطالب" title="الملف الشخصي"><User size={24} aria-hidden="true" /></Button></PopoverTrigger>
      <PopoverContent align="end" className="student-home-account-menu" dir="rtl" aria-label="الحساب">
        <div className="student-home-points" aria-label="إجمالي النقاط">{points == null ? <span>—</span> : <RankingPointsValue value={points} />}</div>
        {[[CalendarDays, 'الجلسات', 'sessions'], [PhoneCall, 'المكالمات', 'calls']].map(([Icon, label, key]) => <Button variant="ghost" key={key} className="student-home-menu-item" onClick={() => select(key)}><Icon size={18} /><span>{label}</span></Button>)}
        <Button variant="ghost" className="student-home-menu-item text-destructive" onClick={onLogout}><LogOut size={18} /><span>تسجيل الخروج</span></Button>
      </PopoverContent>
    </Popover>{(studentName || showProgress) && <div className="student-home-header-level"><span className="student-home-level-name">{studentName}{showProgress && <span> ({levelName})</span>}</span>{showProgress && <StudentHomeProgress value={progress} label={progressLabel} className="student-home-header-progress" />}</div>}</div>
    <div className="student-home-header-actions"><ThemeToggle className="h-11 w-11 shrink-0" />{storeEnabled && <Button className="student-home-store" aria-label="المتجر" onClick={() => onOpen('store')}><ShoppingBag size={20} /></Button>}<NotificationButton presentation="popover" /></div>
  </div></header>;
}
