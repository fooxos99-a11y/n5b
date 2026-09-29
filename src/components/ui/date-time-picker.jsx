import React from 'react';
import DatePicker from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function DateTimePicker({ value = '', onChange, min, label }) {
  const [date, time = '00:00'] = value.split('T');
  return <div className="min-w-0 space-y-2 [font-family:var(--font-ui)]">
    <DatePicker value={date} min={min?.split('T')[0]} ariaLabel={label}
      onChange={next => onChange(`${next}T${time}`)} />
    <div className="flex min-w-0 gap-2">
      <Input type="time" dir="ltr" aria-label={`وقت ${label}`} value={date ? time : ''} disabled={!date}
        min={date === min?.split('T')[0] ? min.split('T')[1] : undefined}
        className="min-w-0 flex-1" onChange={event => onChange(`${date}T${event.target.value || '00:00'}`)} />
      {date && <Button type="button" variant="ghost" aria-label={`مسح ${label}`} onClick={() => onChange('')}>مسح</Button>}
    </div>
  </div>;
}
