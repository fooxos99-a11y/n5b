import React from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import DashboardLoader from '@/components/dashboard/DashboardLoader';

export default function MessageRecipientsList({ recipients, selectedCount, allSelected, onToggleAll, onToggle, isSelected, getKey, renderDetails, renderBadge, loading = false }) {
  const _resolveConditional = () => {
    if (loading) {
      return <DashboardLoader />;
    }
    if (!recipients.length) {
      return <div className="rounded-xl border border-dashed border-primary/20 py-12 text-center text-muted-foreground">لا يوجد مستلمون لعرضهم.</div>;
    }
    return <div className="grid gap-3">
        {recipients.map((recipient) => {
          const selected = isSelected(recipient);
          return <div key={getKey(recipient)} className={`grid gap-3 rounded-2xl border p-4 transition md:grid-cols-[1fr_auto] md:items-center ${selected ? 'border-primary/60 bg-transparent' : 'border-border bg-transparent'}`}>
            <div className="flex min-w-0 items-center gap-3">
              <Button type="button" variant={selected ? 'default' : 'outline'} size="icon" className="h-11 w-11 shrink-0" aria-label={`${selected ? 'إلغاء تحديد' : 'تحديد'} ${recipient.name}`} aria-pressed={selected} onClick={() => onToggle(recipient)}>
                {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              </Button>
              <div className="min-w-0"><div className="break-words text-lg font-bold text-foreground">{recipient.name}</div>{renderDetails?.(recipient)}</div>
            </div>
            <div className="flex items-center gap-2 text-sm font-bold text-primary">{renderBadge?.(recipient)}</div>
          </div>;
        })}
      </div>;
  };
  return <div className="space-y-5 [font-family:var(--font-ui)]">
    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
      <Button type="button" variant="outline" onClick={onToggleAll} className="min-h-11 gap-2" disabled={loading || !recipients.length}>
        {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}تحديد الكل ({recipients.length})
      </Button>
      <div className="text-sm font-semibold text-muted-foreground" aria-live="polite">المحدد: <span className="text-primary">{selectedCount}</span></div>
    </div>
    <div className="max-h-[620px] overflow-y-auto pe-1">
      {_resolveConditional()}
    </div>
  </div>;
}
