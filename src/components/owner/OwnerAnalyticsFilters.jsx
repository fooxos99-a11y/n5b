import React from 'react';
import { Building2, CalendarDays, CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const OwnerAnalyticsFilters = ({ filters, complexes, filterOptions, onChange }) => {
  const selected = filters.complexIds;
  const selectionLabel = selected.length
    ? `${selected.length.toLocaleString('ar-SA-u-nu-latn')} مجمع محدد`
    : 'جميع المجمعات';
  const toggleComplex = (id) => {
    const complexIds = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    onChange({ ...filters, complexIds, committeeId: complexIds.length === 1 ? filters.committeeId : '', teacherId: complexIds.length === 1 ? filters.teacherId : '' });
  };

  return (
    <div className="rounded-xl border border-border/70 bg-card p-2.5 shadow-sm sm:p-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.25fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex min-w-0 flex-col gap-1">
          <Label className="flex h-4 items-center gap-1.5 text-xs font-bold">
            <Building2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            المجمعات
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-11 w-full justify-between bg-card px-2.5 text-sm">
                <span className="truncate">{selectionLabel}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[var(--radix-popover-trigger-width)] min-w-0 bg-card p-2" dir="rtl">
              <Button type="button" variant="ghost" className={`h-10 w-full justify-start px-3 ${!selected.length ? 'font-black text-primary' : ''}`} onClick={() => onChange({ ...filters, complexIds: [], committeeId: '', teacherId: '' })}>
                جميع المجمعات
              </Button>
              <div className="mt-1 max-h-64 space-y-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]">
                {complexes.map((complex) => (
                  <Button key={complex.id} type="button" variant="ghost" className={`h-10 w-full justify-start px-3 ${selected.includes(complex.id) ? 'font-black text-primary' : ''}`} onClick={() => toggleComplex(complex.id)}>
                    <span className="truncate">{complex.name}</span>
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="owner-analytics-from" className="flex h-4 items-center gap-1.5 text-xs font-bold">
            <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            من تاريخ
          </Label>
          <Input
            id="owner-analytics-from"
            type="date"
            value={filters.from}
            max={filters.to}
            onChange={(event) => onChange({ ...filters, from: event.target.value })}
            className="h-11 px-2 text-sm [font-family:var(--font-ui)]"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="owner-analytics-to" className="flex h-4 items-center gap-1.5 text-xs font-bold">
            <CalendarDays className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            إلى تاريخ
          </Label>
          <Input
            id="owner-analytics-to"
            type="date"
            value={filters.to}
            min={filters.from}
            onChange={(event) => onChange({ ...filters, to: event.target.value })}
            className="h-11 px-2 text-sm [font-family:var(--font-ui)]"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="owner-analytics-compare" className="flex h-4 items-center gap-1.5 text-xs font-bold">
            <CalendarRange className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            مقارنة مع:
          </Label>
          <Select value={filters.compare || 'none'} onValueChange={(value) => onChange({ ...filters, compare: value === 'none' ? '' : value })}>
            <SelectTrigger id="owner-analytics-compare" aria-label="اختيار فترة المقارنة" className="h-11 w-full bg-background px-2.5 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون مقارنة</SelectItem>
              <SelectItem value="day">يوم</SelectItem>
              <SelectItem value="week">أسبوع</SelectItem>
              <SelectItem value="month">شهر</SelectItem>
              <SelectItem value="3months">3 أشهر</SelectItem>
              <SelectItem value="6months">6 أشهر</SelectItem>
              <SelectItem value="9months">9 أشهر</SelectItem>
              <SelectItem value="year">سنة</SelectItem>
              <SelectItem value="2years">سنتين</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {selected.length === 1 ? (
        <div className="mt-2 grid gap-2 border-t border-border/60 pt-2 sm:grid-cols-2 lg:w-[27rem]">
          <div className="space-y-1">
            <Label className="text-xs font-bold">الحلقة</Label>
            <Select value={filters.committeeId || 'all'} onValueChange={(value) => onChange({ ...filters, committeeId: value === 'all' ? '' : value })}>
              <SelectTrigger aria-label="فلترة التحليلات حسب الحلقة" className="h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحلق</SelectItem>
                {(filterOptions?.committees || []).map((committee) => <SelectItem key={committee.id} value={String(committee.id)}>{committee.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-bold">المعلم</Label>
            <Select value={filters.teacherId || 'all'} onValueChange={(value) => onChange({ ...filters, teacherId: value === 'all' ? '' : value })}>
              <SelectTrigger aria-label="فلترة التحليلات حسب المعلم" className="h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المعلمين</SelectItem>
                {(filterOptions?.teachers || []).map((teacher) => <SelectItem key={teacher.id} value={String(teacher.id)}>{teacher.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default OwnerAnalyticsFilters;
