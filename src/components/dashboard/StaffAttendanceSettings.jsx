import React from 'react';
import SettingsGroup from './SettingsGroup';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Who records staff attendance, next to who records students (passed as children). */
export default function StaffAttendanceSettings({ settings, setSettings, children }) {
  return (<SettingsGroup>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>تحضير الكادر عن طريق</Label>
        <Select
          value={settings.staffAttendanceSource || 'supervisor'}
          onValueChange={(value) => setSettings({ ...settings, staffAttendanceSource: value })}
        >
          <SelectTrigger aria-label="تحضير الكادر عن طريق" className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="supervisor">المشرف</SelectItem>
            <SelectItem value="teacher">حساباتهم</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {children}
      <div className="space-y-2">
        <Label htmlFor="staff-late-minutes">بداية التأخر بعد أذان العصر بالدقائق</Label>
        <Input id="staff-late-minutes" type="number" min="0" max="1440" step="1"
          value={settings.staffAttendanceLateAfterAsrMinutes ?? 50}
          onChange={event => setSettings({ ...settings, staffAttendanceLateAfterAsrMinutes: event.target.value === '' ? '' : Number(event.target.value) })} />
        <p className="text-xs text-muted-foreground">بحسب توقيت العصر المعتمد لمدينة بريدة.</p>
      </div>
    </div>
  </SettingsGroup>);
}
