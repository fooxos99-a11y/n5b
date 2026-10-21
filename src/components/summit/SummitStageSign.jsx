import React from 'react';
import { Check, LockKeyhole, MapPin, Navigation } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QASSIM_MAP_SIZE } from './qassimMapData';
export default function SummitStageSign({ index, stage, position, isNext, onClick }) {
  const state = stage.completed ? 'is-completed' : stage.unlocked ? 'is-unlocked' : isNext ? 'is-next' : 'is-locked';
  const Icon = stage.completed ? Check : !stage.unlocked ? LockKeyhole : stage.notificationEnabled ? Navigation : MapPin;
  return <Button type="button" variant="ghost" size="icon" disabled={!stage.unlocked || !stage.notificationEnabled}
    onClick={() => onClick?.(stage)} className={`summit-stage-sign ${state}`}
    style={{ left: `${position.x / QASSIM_MAP_SIZE.width * 100}%`, top: `${position.y / QASSIM_MAP_SIZE.height * 100}%` }}
    aria-label={`${stage.name} عند ${stage.points.toLocaleString('ar-SA-u-nu-latn')} كيلومتر${stage.completed ? '، مكتملة' : ''}`}>
    <Icon aria-hidden="true" /><span className="summit-stage-number" aria-hidden="true">{index + 1}</span>
  </Button>;
}
