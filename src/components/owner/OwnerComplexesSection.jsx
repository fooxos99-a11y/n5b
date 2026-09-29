import React from 'react';
import { Plus } from 'lucide-react';
import OwnerComplexCard from '@/components/owner/OwnerComplexCard';
import OwnerComplexToolbar from '@/components/owner/OwnerComplexToolbar';
import OwnerErrorState from '@/components/owner/OwnerErrorState';
import { Button } from '@/components/ui/button';

const OwnerComplexesSection = ({ complexes, visibleComplexes, search, setSearch, onCreate, onEdit, onToggleStatus, onOpenComplex, onRetry, error, busy }) => { const _resolveOwnerComplexesSection = () => {
                                                                                                                                                                 if (error) {
                                                                                                                                                                   return <OwnerErrorState message={error} onRetry={onRetry} />;
                                                                                                                                                                 }
                                                                                                                                                                 if (complexes.length) {
                                                                                                                                                                   return <>
        <OwnerComplexToolbar query={search} onQueryChange={setSearch} onAdd={onCreate} />
        {visibleComplexes.length ? (
          <div className="grid gap-3">
            {visibleComplexes.map((complex) => (
              <OwnerComplexCard
                key={complex.id}
                complex={complex}
                busy={busy}
                onEdit={onEdit}
                onToggleStatus={onToggleStatus}
                onOpen={onOpenComplex}
              />
            ))}
          </div>
        ) : (
          <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
            <div>
              <p className="font-black text-foreground">لا توجد نتائج</p>
              <Button type="button" variant="outline" className="mt-3 h-11" onClick={() => setSearch('')}>مسح البحث</Button>
            </div>
          </div>
        )}
      </>;
                                                                                                                                                                 }
                                                                                                                                                                 return <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
        <div>
          <h3 className="font-black text-foreground">لا توجد مجمعات</h3>
          <Button type="button" className="mt-3 h-11 gap-2" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            إضافة مجمع
          </Button>
        </div>
      </div>;
                                                                                                                                                               };
                                                                                                                                                               return (<section className="space-y-4 [font-family:var(--font-ui)]">
    <h2 className="text-xl font-black text-foreground sm:text-2xl">المجمعات</h2>
    {_resolveOwnerComplexesSection()}
  </section>); };

export default OwnerComplexesSection;
