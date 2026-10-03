import React from 'react';
import { Button } from '@/components/ui/button';
import { ManagementEmpty } from '@/components/dashboard/layout/ManagementPanel';

export default function CallRoomCards({ rooms, onJoinRoom }) {
  if (!rooms.length) return <ManagementEmpty>لا توجد مكالمات حاليًا.</ManagementEmpty>;
  return <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]" dir="rtl">{rooms.map(room =>
    <article key={room.id} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 break-words text-base font-bold">{room.name}</h2>
        <span role="img" aria-label={room.studentPresent ? 'الطالب موجود' : 'لا يوجد طالب'} className={`h-3 w-3 shrink-0 rounded-full ${room.studentPresent ? 'bg-red-500' : 'bg-emerald-500'}`} />
      </div>
      <Button onClick={() => onJoinRoom?.(room)} className="mt-auto min-h-11 w-full">دخول المكالمة</Button>
    </article>
  )}</div>;
}
