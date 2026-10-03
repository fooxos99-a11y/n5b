import React from 'react';
import RankingList from '@/components/rankings/RankingList';

export default function RankingPanel({ title, rows, listClassName }) {
  return <section className="min-w-0 rounded-2xl border border-border bg-card p-4 [font-family:var(--font-ui)] sm:p-5" aria-label={title}>
    <h2 className="mb-3 border-b border-border/70 pb-3 text-sm font-semibold">{title}</h2>
    {rows.length ? <RankingList cards rows={rows} className={listClassName} />
      : <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">لا توجد بيانات في هذه الفترة.</p>}
  </section>;
}
