import React from 'react';
import CoinIcon from '@/components/points/CoinIcon';
import { cn } from '@/lib/utils';
import { formatPointsNumber } from '@/lib/pointsFormat';

const PointsValue = ({ value = 0, className, iconClassName }) => (
  <span className={cn('inline-flex items-center gap-1.5 font-black text-[#a66a10] dark:text-[#f0bd55]', className)}>
    <span>{formatPointsNumber(value)}</span>
    <CoinIcon className={iconClassName} />
  </span>
);

export default PointsValue;
