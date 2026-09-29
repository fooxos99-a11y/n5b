import React from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const OwnerComplexToolbar = ({
  query,
  onQueryChange,
  onAdd,
}) => (
  <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm sm:p-4">
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="relative min-w-0">
        <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="البحث في المجمعات"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="ابحث باسم المجمع أو رقمه"
          className="h-11 rounded-xl border-border bg-background pr-10"
        />
      </div>
      <Button
        type="button"
        aria-label="إضافة مجمع"
        className="h-11 min-w-11 gap-2 rounded-xl px-3 sm:px-5"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">إضافة</span>
      </Button>
    </div>
  </div>
);

export default OwnerComplexToolbar;
