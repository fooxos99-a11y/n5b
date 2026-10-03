import React, { useMemo, useState } from 'react';
import { Download, Eye, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const number = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn', { maximumFractionDigits: 1 });
const percent = (value) => `${number(value)}%`;
const sortOptions = {
  attendanceRate: 'الحضور',
  executionRate: 'تنفيذ مهام الفترة',
  studentsCount: 'الطلاب',
  quranFacesTotal: 'الإنجاز',
};
const performanceRating = (stats) => {
  const score = (Number(stats.attendanceRate || 0) + Number(stats.executionRate || 0)) / 2;
  if (score >= 90) return { label: 'ممتاز', className: 'text-emerald-600' };
  if (score >= 75) return { label: 'جيد جدًا', className: 'text-sky-600' };
  if (score >= 60) return { label: 'جيد', className: 'text-amber-600' };
  return { label: 'يحتاج متابعة', className: 'text-red-600' };
};

const exportCsv = (rows) => {
  const header = ['المجمع', 'الطلاب', 'الحلق', 'مشرفو المسارات', 'الحضور', 'الغياب', 'الإنجاز', 'تنفيذ مهام الفترة', 'الطلاب الجدد', 'المتأخرون', 'التقييم'];
  const content = [header, ...rows.map((row) => [
    row.name, row.stats.studentsCount, row.stats.committeesCount, row.stats.teachersCount,
    row.stats.attendanceRate, row.stats.absenceRate, row.stats.quranFacesTotal,
    row.stats.executionRate, row.stats.newStudentsCount,
    row.stats.delayedStudentsCount, performanceRating(row.stats).label,
  ])].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'تحليلات-المجمعات.csv';
  anchor.click();
  URL.revokeObjectURL(url);
};

const OwnerComplexAnalyticsTable = ({ complexes, onOpenComplex }) => {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('attendanceRate');
  const rows = useMemo(() => complexes
    .filter((row) => !query.trim() || String(row.name).includes(query.trim()) || String(row.registrationNumber).includes(query.trim()))
    .sort((left, right) => Number(right.stats?.[sortKey] || 0) - Number(left.stats?.[sortKey] || 0)), [complexes, query, sortKey]);

  return (
    <section className="rounded-2xl border border-border/70 bg-card shadow-sm [font-family:var(--font-ui)]">
      <div className="grid gap-3 border-b border-border/70 p-3 sm:grid-cols-[1fr_auto_auto] sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input aria-label="البحث في جدول المجمعات" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم المجمع أو رقمه" className="h-11 pr-10" />
        </div>
        <Select value={sortKey} onValueChange={setSortKey}>
          <SelectTrigger aria-label="ترتيب جدول المجمعات" className="h-11 w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>{Object.entries(sortOptions).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => exportCsv(rows)} disabled={!rows.length}>
          <Download className="h-4 w-4" aria-hidden="true" />
          تصدير
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[1150px] w-full text-right text-sm">
          <thead className="bg-muted/45 text-xs text-muted-foreground">
            <tr>{['المجمع', 'الطلاب', 'الحلق', 'مشرفو المسارات', 'الحضور', 'الغياب', 'الإنجاز', 'تنفيذ مهام الفترة', 'الجدد', 'المتأخرون', 'التقييم', 'التفاصيل'].map((label) => <th key={label} className="px-3 py-3 font-black">{label}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/25">
                <td className="px-3 py-3"><strong className="block text-foreground">{row.name}</strong><small className="text-muted-foreground">{row.registrationNumber}</small></td>
                <td className="px-3 py-3">{number(row.stats.studentsCount)}</td>
                <td className="px-3 py-3">{number(row.stats.committeesCount)}</td>
                <td className="px-3 py-3">{number(row.stats.teachersCount)}</td>
                <td className="px-3 py-3 font-bold text-emerald-600">{percent(row.stats.attendanceRate)}</td>
                <td className="px-3 py-3 font-bold text-red-600">{percent(row.stats.absenceRate)}</td>
                <td className="px-3 py-3">{number(row.stats.quranFacesTotal)}</td>
                <td className="px-3 py-3">{percent(row.stats.executionRate)}</td>
                <td className="px-3 py-3">{number(row.stats.newStudentsCount)}</td>
                <td className="px-3 py-3">{number(row.stats.delayedStudentsCount)}</td>
                <td className={`px-3 py-3 font-black ${performanceRating(row.stats).className}`}>{performanceRating(row.stats).label}</td>
                <td className="px-3 py-3"><Button type="button" variant="ghost" size="icon" aria-label={`فتح تفاصيل ${row.name}`} onClick={() => onOpenComplex(row.id)}><Eye className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length ? <div className="p-8 text-center font-bold text-muted-foreground">لا توجد نتائج.</div> : null}
      </div>
    </section>
  );
};

export default OwnerComplexAnalyticsTable;
