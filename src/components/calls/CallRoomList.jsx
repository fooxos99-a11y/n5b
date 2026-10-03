import React from 'react';
import { PhoneCall } from 'lucide-react';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { ManagementList, ManagementRow } from '@/components/dashboard/layout/ManagementPanel';

export default function CallRoomList({ rooms, onJoinRoom }) {
  const sorted = [...rooms].sort((a, b) => Number(Boolean(b.studentPresent)) - Number(Boolean(a.studentPresent)));
  return <ManagementList label="المكالمات">{sorted.map(room => {
    const names = (room.participants || []).map(person => person.name);
    const status = room.studentPresent ? 'الطالب موجود' : names.length ? 'موجودون دون طالب' : 'المكالمة فارغة';
    return <ManagementRow key={room.id} title={room.name}
      subtitle={[room.committeeName, status, names.join('، ')].filter(Boolean).join('، ')}
      icon={<span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${room.studentPresent ? 'bg-red-500' : names.length ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />}
      onOpen={() => onJoinRoom?.(room)} openLabel={`دخول ${room.name}`}
      actions={<ManagementIconButton className="h-11 w-11 border-transparent bg-transparent" tone="primary" onClick={() => onJoinRoom?.(room)} title="دخول المكالمة" aria-label={`دخول ${room.name}`}><PhoneCall className="h-4 w-4" /></ManagementIconButton>} />;
  })}</ManagementList>;
}
