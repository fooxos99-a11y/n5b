import React from 'react';
import StudentLevelIndicators from './StudentLevelIndicators';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ErrorState from '@/components/ui/error-state';
import { formatStatisticsNumber as formatNumber } from '@/lib/statisticsNumber';
import { MetricTile } from './MetricCard';
import { ALL_COMMITTEES } from './reportMetrics';

const tint = (color, amount = 14) => `color-mix(in oklab, ${color} ${amount}%, transparent)`;
// Keep six indicators balanced across two rows.
const TILE_GRID = Object.freeze({ 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4', 5: 'grid-cols-3 sm:grid-cols-5', 6: 'grid-cols-2 sm:grid-cols-3' });
const STAT_GRID = Object.freeze({ 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 sm:grid-cols-4', 5: 'grid-cols-2 sm:grid-cols-5', 6: 'grid-cols-2 sm:grid-cols-3' });

const BarGroup = ({ group, color }) => (
  <section className={group.compact ? 'grid grid-cols-2 gap-2 sm:grid-cols-3' : 'space-y-3'}>
    <h3 className="col-span-full text-xs font-bold text-muted-foreground">{group.title}</h3>
    {group.rows.map((row, index) => {
      const percent = Math.max(0, Math.min(100, Number(row.percent || 0)));
      return (
        <div key={`${row.label}-${index}`} className={`min-w-0 rounded-xl border border-border bg-card ${group.compact ? 'p-3' : 'p-4'}`}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-bold">{row.label}</span>
            <span className="shrink-0 font-black tabular-nums" style={row.color ? undefined : { color }} dir={row.display ? undefined : 'ltr'}>{row.display ?? `${formatNumber(percent)}%`}</span>
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${percent}%`, background: row.color || color, transitionDelay: `${index * 45}ms` }}
            />
          </div>
        </div>
      );
    })}
  </section>
);

const RecordRow = ({ row }) => (
  <div className="rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{row.label}</p>
        {row.note && <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.note}</p>}
      </div>
      {row.value && <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${row.tone || 'bg-muted text-foreground'}`}>{row.value}</span>}
    </div>
    {row.stats?.length > 0 && (
      <dl className={`mt-3 grid gap-2 ${STAT_GRID[row.stats.length] || 'grid-cols-2 sm:grid-cols-4'}`}>
        {row.stats.map((stat) => (
          <div key={stat.label} className={`min-w-0 rounded-lg px-3 py-2 ${stat.tone || 'bg-muted/50'}`}>
            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-bold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
    )}
  </div>
);

const RecordGroup = ({ group }) => (
  <section className="space-y-2">
    <h3 className="text-xs font-bold text-muted-foreground">{group.title}</h3>
    {group.rows.length ? group.rows.map((row, index) => <RecordRow key={`${row.label}-${index}`} row={row} />) : (
      <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        {group.emptyText || 'لا توجد سجلات في هذه الفترة'}
      </p>
    )}
  </section>
);

/** Centred window of one indicator: small summary cards, the circles and the records behind it. */
export default function MetricDetails({ metric, periodLabel, committees = [], committee = ALL_COMMITTEES, onCommitteeChange, onClose, onRetry }) {
  const Icon = metric?.icon;
  const tiles = metric?.tiles || [];
  return (
    <Dialog open={Boolean(metric)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100dvh-2rem)] max-w-3xl gap-0 bg-[hsl(var(--background))] p-0 sm:p-0 [font-family:var(--font-ui)]"
        dir="rtl"
      >
        {metric && (
          <>
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-[hsl(var(--background))] px-4 py-3 sm:px-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ background: tint(metric.color), color: metric.color }}>
                {Icon && <Icon className="h-5 w-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-base">تفاصيل {metric.label}</DialogTitle>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" onClick={onClose} aria-label="إغلاق">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="space-y-6 p-4 sm:p-6">
              {committees.length > 1 && (
                <Select value={committee} onValueChange={onCommitteeChange}>
                  <SelectTrigger aria-label="الحلقة" className="h-11 w-full text-sm sm:w-56 [&_span]:truncate">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_COMMITTEES}>كل الحلقات</SelectItem>
                    {committees.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {metric.error ? (
                <ErrorState message={metric.error} onRetry={onRetry} />
              ) : metric.loading ? (
                <DashboardLoader className="py-10" />
              ) : (
                <>
                  {tiles.length > 0 && (
                    <div className={`grid gap-3 ${TILE_GRID[tiles.length] || 'grid-cols-2 sm:grid-cols-4'}`}>
                      {tiles.map((tile) => <MetricTile key={tile.label} tile={tile} color={metric.color} />)}
                    </div>
                  )}
                  {metric.levelGroups && <StudentLevelIndicators key={committee} groups={metric.levelGroups} records={metric.records || []} />}
                  {(metric.bars || []).filter((group) => group.rows.length).map((group) => (
                    <BarGroup key={group.title} group={group} color={metric.color} />
                  ))}
                  {!metric.levelGroups && (metric.records || []).map((group) => <RecordGroup key={group.title} group={group} />)}
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
