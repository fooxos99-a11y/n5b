import React from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const comparison = (current, previous) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  const _resolveChange = () => {
    if (previousValue) {
      return ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
    }
    if (currentValue) {
      return 100;
    }
    return 0;
  };
  const change = _resolveChange();
  const _resolveDirection = () => {
    if (change > 0) {
      return 'up';
    }
    if (change < 0) {
      return 'down';
    }
    return 'same';
  };
  return { change, direction: _resolveDirection() };
};

const OwnerMetricCard = ({ icon: Icon, label, value, rawValue, previousValue, positiveWhenDown = false, tone = 'text-primary' }) => {
  const hasComparison = previousValue !== null && previousValue !== undefined;
  const change = comparison(rawValue, previousValue);
  const positive = change.direction === 'same' || (positiveWhenDown ? change.direction === 'down' : change.direction === 'up');
  const _resolveChangeIcon = () => {
    if (change.direction === 'up') {
      return ArrowUp;
    }
    if (change.direction === 'down') {
      return ArrowDown;
    }
    return Minus;
  };
  const ChangeIcon = _resolveChangeIcon();
  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardContent className="min-h-32 p-3 [font-family:var(--font-ui)] sm:p-4">
        <span className={`grid h-10 w-10 place-items-center rounded-xl bg-primary/10 ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <strong className="mt-3 block text-xl font-black text-foreground sm:text-2xl">{value}</strong>
        <span className="mt-0.5 block text-xs font-bold text-muted-foreground sm:text-sm">{label}</span>
        {hasComparison ? (
          <span className={`mt-2 flex items-center gap-1 text-[11px] font-black ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
            <ChangeIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {Math.abs(change.change).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 1 })}% عن فترة المقارنة
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default OwnerMetricCard;
