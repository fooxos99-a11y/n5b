import React from 'react';
import SummitMapTextInput from './SummitMapTextInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/setting-toggle';
export default function SummitMapEventFields({ entity, idPrefix, maximumKilometer = 7999, isStation = false, active = false,
  onActiveChange, onRecordPoints, pointsDisabled = false, onChange }) {
  return <div className="grid gap-4 sm:grid-cols-2 [font-family:var(--font-ui)]" dir="rtl">
    <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-name`}>الاسم</Label><SummitMapTextInput id={`${idPrefix}-name`} value={entity.name} maxLength={60} onCommit={name => onChange({ name })} /></div>
    {!isStation && <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-kilometer`}>كيلومتر الوصول</Label><Input id={`${idPrefix}-kilometer`} type="number" min="0" max={maximumKilometer} value={entity.kilometer} onChange={event => onChange({ kilometer: Number(event.target.value) })} /></div>}
    {isStation ? <>
      <div className="flex items-end"><Button type="button" variant={active ? 'destructive' : 'default'} className="min-h-11 w-full" onClick={() => onActiveChange?.(!active)}>{active ? 'إلغاء تفعيل المحطة' : 'تفعيل المحطة'}</Button></div>
      <div className="space-y-1.5"><Label htmlFor={`${idPrefix}-points`}>نقاط المحطة</Label><Input id={`${idPrefix}-points`} type="number" min="0" max="10000" step="1" value={entity.rewardPoints} onChange={event => onChange({ rewardPoints: Number(event.target.value) })} /></div>
      {active && <div className="flex items-end"><Button type="button" className="min-h-11 w-full" disabled={pointsDisabled} onClick={onRecordPoints}>تسجيل النقاط</Button></div>}
    </> : <>
      <div className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-primary/15 px-3 sm:col-span-2"><Label>الإشعار</Label><ToggleSwitch ariaLabel="إشعار عند الوصول" checked={entity.notificationEnabled} onCheckedChange={notificationEnabled => onChange({ notificationEnabled })} /></div>
      {entity.notificationEnabled && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={`${idPrefix}-notification`}>نص الإشعار</Label><SummitMapTextInput id={`${idPrefix}-notification`} value={entity.notificationText} maxLength={180} onCommit={notificationText => onChange({ notificationText })} /></div>}
    </>}
  </div>;
}
