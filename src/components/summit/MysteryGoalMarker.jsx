import React from 'react';
import { Flag, LockKeyhole } from 'lucide-react';
import { QASSIM_MAP_SIZE } from '@/components/summit/qassimMapData';

const MysteryGoalMarker = ({ position, revealed, name = 'الوجهة النهائية' }) => (
  <div
    className={`summit-mystery-goal ${revealed ? 'is-revealed' : ''}`}
    style={{
      left: `${(position.x / QASSIM_MAP_SIZE.width) * 100}%`,
      top: `${(position.y / QASSIM_MAP_SIZE.height) * 100}%`,
    }}
    role="img"
    aria-label={revealed ? `نقطة النهاية: ${name}` : 'نقطة نهاية مخفية'}
  >
    <div className="summit-goal-mask" aria-hidden="true" />
    <div className="summit-goal-pin" aria-hidden="true">
      {revealed ? <Flag /> : <LockKeyhole />}
    </div>
    <span>{revealed ? name : 'الهدف النهائي'}</span>
  </div>
);

export default MysteryGoalMarker;
