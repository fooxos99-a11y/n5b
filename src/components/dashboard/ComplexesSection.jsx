import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ErrorState from '@/components/ui/error-state';
import DashboardLoader from './DashboardLoader';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { FormField, ManagementEmpty, ManagementList, ManagementRow, ManagementToolbar } from './layout/ManagementPanel';
import { useToast } from '@/components/ui/use-toast';
import { complexesApi } from '@/services/complexesApi';

export default function ComplexesSection({ disabled = false }) {
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setRows(await complexesApi.list()); }
    catch (reason) { setError(reason.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const edit = row => { setSelected(row); setName(row?.name || ''); setOpen(true); };
  const save = async () => {
    setSaving(true);
    try {
      if (selected) await complexesApi.update(selected.id, { name });
      else await complexesApi.create({ name });
      setOpen(false);
      await load();
    } catch (reason) { toast({ title: 'تعذر حفظ المجمع', description: reason.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const normalizedSearch = search.trim().toLocaleLowerCase('ar');
  const visibleRows = rows.filter(row => String(row.name || '').toLocaleLowerCase('ar').includes(normalizedSearch));
  const actionClass = 'h-11 w-11 border-transparent bg-transparent';
  return <>
    <ManagementToolbar>
      <Input type="search" aria-label="ابحث باسم المجمع" placeholder="ابحث باسم المجمع" value={search}
        onChange={event => setSearch(event.target.value)} className="h-11 flex-1 basis-56" />
      <Button disabled={disabled} onClick={() => edit(null)} className="h-11 gap-2 px-5"><Plus className="h-4 w-4" />إضافة مجمع</Button>
    </ManagementToolbar>
    {loading ? <DashboardLoader /> : error ? <ErrorState message={error} onRetry={load} /> : visibleRows.length ? <ManagementList label="المجمعات">
      {visibleRows.map(row => <ManagementRow key={row.id} title={row.name} subtitle={`${row.committeesCount} حلقات`} disabled={disabled} onOpen={() => edit(row)} openLabel={`تعديل ${row.name}`}
        actions={<ManagementIconButton className={actionClass} disabled={disabled} onClick={() => edit(row)} title="تعديل المجمع" aria-label={`تعديل ${row.name}`} tone="primary"><Pencil className="h-4 w-4" /></ManagementIconButton>} />)}
    </ManagementList> : <ManagementEmpty>{normalizedSearch ? 'لا توجد مجمعات مطابقة للبحث.' : 'لا توجد مجمعات.'}</ManagementEmpty>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent dir="rtl">
      <DialogHeader><DialogTitle>{selected ? 'تعديل المجمع' : 'إضافة مجمع'}</DialogTitle></DialogHeader>
      <FormField label="اسم المجمع" htmlFor="complex-name"><Input id="complex-name" maxLength={180} value={name} onChange={event => setName(event.target.value)} /></FormField>
      <DialogFooter><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>إلغاء</Button><Button loading={saving} disabled={disabled || !name.trim()} onClick={save}>حفظ</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
