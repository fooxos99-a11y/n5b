import ErrorState from '@/components/ui/error-state';
import React, { useCallback, useEffect, useState } from 'react';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { FormField, FormGrid, ManagementEmpty, ManagementList, ManagementPanel, ManagementRow, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { studentsApi } from '@/services/studentsApi';
import useOnlineStatus from '@/hooks/useOnlineStatus';
import { loadOfflineSnapshot } from '@/services/offlineOperationsService';

const emptyFamily = { name: '', points: 0 };
const FamiliesSection = () => {
  const isOnline = useOnlineStatus();
  const accountId = Number(localStorage.getItem('wajeh_account_id') || localStorage.getItem('wajeh_supervisor_id') || 0);
  const actorRole = localStorage.getItem('wajeh_role') || 'manager';
  const { toast } = useToast();
  const [families, setFamilies] = useState([]);
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(emptyFamily);
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [previewStudents, setPreviewStudents] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadFamilies = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const rows = await loadOfflineSnapshot(
        accountId,
        `management:families:${isOnline ? search : ''}`,
        () => studentsApi.getFamilies({ search }),
        { actorRole },
      );
      const normalizedSearch = search.trim().toLocaleLowerCase('ar');
      setFamilies(!isOnline && normalizedSearch
        ? rows.filter((family) => String(family.name || '').toLocaleLowerCase('ar').includes(normalizedSearch))
        : rows);
    } catch (error) {
      setLoadError(error.message || 'تعذر تحميل الحلقات.');
    } finally {
      setIsLoading(false);
    }
  }, [accountId, actorRole, isOnline, search]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadFamilies().catch((error) => {
        toast({ title: 'تعذر تحميل الحلقات', description: error.message, variant: 'destructive' });
      });
    }, 250);

    return () => clearTimeout(timeout);
  }, [loadFamilies, toast]);

  const openAddDialog = () => {
    setSelectedFamily(null);
    setForm(emptyFamily);
    setDialog('form');
  };

  const openEditDialog = (family) => {
    setSelectedFamily(family);
    setForm({ name: family.name || '', points: Number(family.points || 0) });
    setDialog('form');
  };

  const saveFamily = async () => {
    try {
      if (selectedFamily) {
        await studentsApi.updateFamily(selectedFamily.id, form);
        toast({ title: 'تم التحديث', description: 'تم تحديث بيانات الحلقة.' });
      } else {
        await studentsApi.createFamily(form);
        toast({ title: 'تم الحفظ', description: 'تمت إضافة الحلقة.' });
      }
      setDialog(null);
      setSelectedFamily(null);
      setForm(emptyFamily);
      await loadFamilies();
    } catch (error) {
      toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' });
    }
  };

  const confirmDelete = (family) => {
    setSelectedFamily(family);
    setDialog('delete');
  };

  const deleteFamily = async () => {
    if (!selectedFamily) return;
    try {
      const result = await studentsApi.deleteFamily(selectedFamily.id);
      toast({
        title: 'تم الحذف',
        description: result.detachedStudents
          ? `تم حذف الحلقة والإبقاء على ${result.detachedStudents} طالب بلا حلقة.`
          : 'تم حذف الحلقة.',
      });
      setDialog(null);
      setSelectedFamily(null);
      await loadFamilies();
    } catch (error) {
      toast({ title: 'تعذر الحذف', description: error.message, variant: 'destructive' });
    }
  };

  const openPreview = async (family) => {
    setSelectedFamily(family);
    setDialog('preview');
    try {
      const students = await loadOfflineSnapshot(
        accountId,
        `management:family-students:${family.id}`,
        () => studentsApi.getFamilyStudents(family.id),
        { actorRole },
      );
      setPreviewStudents(students);
      setFamilies((current) =>
        current.map((item) =>
          item.id === family.id ? { ...item, studentsCount: students.length } : item
        )
      );
    } catch (error) {
      setPreviewStudents([]);
      toast({ title: 'تعذر تحميل الطلاب', description: error.message, variant: 'destructive' });
    }
  };

  const _resolveFamiliesSection = () => {
    if (isLoading) {
      return <DashboardLoader />;
    }
    if (loadError) return <ErrorState message={loadError} onRetry={loadFamilies} />;
    if (families.length === 0) {
      return <ManagementEmpty>لا توجد حلقات حالياً.</ManagementEmpty>;
    }
    const actionClass = 'h-11 w-11 border-transparent bg-transparent';
    return <ManagementList label="الحلقات">
      {families.map((family) => (
        <ManagementRow
          key={family.id}
          title={family.name}
          onOpen={() => openEditDialog(family)}
          openLabel={`تعديل ${family.name}`}
          disabled={!isOnline}
          actions={<>
            <ManagementIconButton className={actionClass} disabled={!isOnline} onClick={() => openEditDialog(family)} title="تعديل الحلقة" aria-label={`تعديل ${family.name}`} tone="primary">
              <Pencil className="h-4 w-4" />
            </ManagementIconButton>
            <ManagementIconButton className={actionClass} onClick={() => openPreview(family)} title="معاينة الطلاب" aria-label={`معاينة طلاب ${family.name}`}>
              <Eye className="h-4 w-4" />
            </ManagementIconButton>
            <ManagementIconButton className={actionClass} disabled={!isOnline} onClick={() => confirmDelete(family)} title="حذف" aria-label={`حذف ${family.name}`} tone="destructive">
              <Trash2 className="h-4 w-4" />
            </ManagementIconButton>
          </>}
        />
      ))}
    </ManagementList>;
  };
  return (
    <ManagementPanel>
      {!isOnline ? <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm font-bold text-amber-700 sm:px-6">عرض محلي للقراءة فقط حتى عودة الاتصال.</div> : null}
      <ManagementToolbar>
        <Input
          type="search"
          aria-label="ابحث باسم الحلقة"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث باسم الحلقة"
          className="h-11 flex-1 basis-56"
        />
        <Button onClick={openAddDialog} disabled={!isOnline} className="h-11 gap-2 px-5">
          <Plus className="h-4 w-4" />إضافة حلقة
        </Button>
      </ManagementToolbar>
      {_resolveFamiliesSection()}

      <Dialog open={dialog === 'form'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary">
              {selectedFamily ? 'تعديل الحلقة' : 'إضافة حلقة'}
            </DialogTitle>
          </DialogHeader>
          <FormGrid className="py-2">
            <FormField label="اسم الحلقة" htmlFor="family-name" wide={!selectedFamily}>
              <Input id="family-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="اكتب الاسم" />
            </FormField>
            {selectedFamily ? (
              <FormField label="النقاط" htmlFor="family-points">
                <Input
                  id="family-points"
                  type="number"
                  min="0"
                  value={form.points}
                  readOnly
                  disabled
                />
              </FormField>
            ) : null}
          </FormGrid>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} className="h-11">إلغاء</Button>
            <Button onClick={saveFamily} className="h-11">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'preview'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-2xl bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary">طلاب {selectedFamily?.name}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto rounded-xl border border-border">
            {previewStudents.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">لا يوجد طلاب في هذه الحلقة.</div>
            ) : (
              <ul className="divide-y divide-border">
                {previewStudents.map((student) => (
                  <li key={student.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3">
                    <span className="min-w-0 truncate font-medium">{student.name}</span>
                    <span className="shrink-0 text-muted-foreground" dir="ltr">{student.guardianPhone || '-'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} className="h-11">إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card text-foreground [font-family:var(--font-ui)]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-muted-foreground">
            هل تريد حذف حلقة {selectedFamily?.name}؟
            {Number(selectedFamily?.studentsCount) > 0 ? ` سيبقى ${selectedFamily.studentsCount} طالب بلا حلقة، ولن يظهروا للمعلم حتى تعيين حلقة أخرى.` : ''}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} className="h-11">إلغاء</Button>
            <Button variant="destructive" onClick={deleteFamily} className="h-11">حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagementPanel>
  );
};

export default FamiliesSection;
