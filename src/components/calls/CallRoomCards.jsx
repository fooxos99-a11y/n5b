import React from 'react';
import { Headphones, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManagementEmpty } from '@/components/dashboard/layout/ManagementPanel';

export default function CallRoomCards({ rooms, onJoinRoom }) {
  const groups = [
    { title: 'الطلاب الموجودون الآن', studentPresent: true },
    { title: 'المكالمات الأخرى', studentPresent: false },
  ];
  return <div className="space-y-6" dir="rtl">
    {groups.map(group => {
      const visible = rooms.filter(room => Boolean(room.studentPresent) === group.studentPresent);
      return <section key={group.title} aria-label={group.title} className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-bold"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${group.studentPresent ? 'bg-red-500' : 'bg-emerald-500'}`} />{group.title}</h2>
        {!visible.length ? <ManagementEmpty>{group.studentPresent ? 'لا يوجد طلاب داخل المكالمات حاليًا.' : 'لا توجد مكالمات أخرى.'}</ManagementEmpty>
          : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map(room => {
            const names = (room.participants || []).map(person => person.name);
            const state = room.studentPresent ? 'الطالب موجود' : names.length ? 'موجودون دون طالب' : 'المكالمة فارغة';
            return <article key={room.id} className={`flex min-w-0 flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm ${room.studentPresent ? 'border-red-500/30' : 'border-border'}`}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Headphones className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1"><h3 className="break-words text-base font-bold">{room.name}</h3><p className="mt-1 break-words text-xs text-muted-foreground">{room.committeeName}</p></div>
                <span role="img" aria-label={state} className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${room.studentPresent ? 'bg-red-500' : names.length ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
              </div>
              <p className="min-h-10 break-words text-sm leading-6 text-muted-foreground">{names.length ? `الموجودون الآن: ${names.join('، ')}` : 'لا يوجد أحد داخل المكالمة حاليًا'}</p>
              <Button onClick={() => onJoinRoom?.(room)} className="mt-auto min-h-11 w-full gap-2"><PhoneCall className="h-4 w-4" />دخول المكالمة</Button>
            </article>;
          })}</div>}
      </section>;
    })}
  </div>;
}
