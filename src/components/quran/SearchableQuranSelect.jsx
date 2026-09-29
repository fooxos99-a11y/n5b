import React, { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const normalizeSearchText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[أإآ]/g, 'ا')
  .replaceAll('ى', 'ي')
  .replaceAll('ة', 'ه')
  .trim()
  .toLowerCase();

const SearchableQuranSelect = ({
  value,
  options,
  placeholder,
  title,
  searchPlaceholder,
  searchLabel,
  searchInputMode = 'search',
  onChange,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selectedOption = options.find((option) => String(option.value) === String(value));
  const normalizedQuery = normalizeSearchText(query);
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options;
    return options.filter((option) => normalizeSearchText(option.searchText || option.label).includes(normalizedQuery));
  }, [normalizedQuery, options]);

  const selectMobileOption = (optionValue) => {
    onChange(String(optionValue));
    setMobileOpen(false);
    setQuery('');
  };

  return (
    <>
      <div className="hidden sm:block">
        <Select value={String(value || '')} onValueChange={onChange}>
          <SelectTrigger aria-label={placeholder} className="h-auto min-h-12 min-w-0 [&>span]:whitespace-normal [&>span]:leading-5">
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_3rem] gap-2 sm:hidden">
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={mobileOpen}
          className="h-12 min-w-0 justify-start overflow-hidden px-3 text-right font-normal"
          onClick={() => setMobileOpen(true)}
        >
          <span className="truncate">{selectedOption?.label || placeholder}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label={searchLabel}
          className="h-12 w-12 p-0"
          onClick={() => setMobileOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={mobileOpen} onOpenChange={(open) => {
        setMobileOpen(open);
        if (!open) setQuery('');
      }}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] gap-3 border-primary/30 bg-card p-4 [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary">{title}</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              type="search"
              inputMode={searchInputMode}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
              className="h-12 pr-10"
            />
          </div>
          <div role="listbox" aria-label={title} className="grid max-h-[60dvh] gap-1 overflow-y-auto overscroll-contain rounded-lg border border-primary/15 p-1 touch-pan-y [-webkit-overflow-scrolling:touch]">
            {filteredOptions.map((option) => {
              const selected = String(option.value) === String(value);
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex min-h-12 items-center justify-between rounded-md px-3 text-right text-sm font-bold transition-colors ${selected ? 'bg-primary/15 text-primary' : 'hover:bg-primary/10'}`}
                  onClick={() => selectMobileOption(option.value)}
                >
                  <span>{option.label}</span>
                  {selected && <Check className="h-4 w-4 text-primary" />}
                </button>
              );
            })}
            {!filteredOptions.length && (
              <div className="p-6 text-center text-sm font-bold text-muted-foreground">لا توجد نتيجة مطابقة.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SearchableQuranSelect;
