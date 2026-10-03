import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import PasswordInput from '@/components/ui/password-input';
import PermissionChecklist from './PermissionChecklist';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { FormField, FormGrid, ManagementEmpty, ManagementList, ManagementRow, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { normalizeDashboardPermissions } from '@/lib/dashboardPermissions';
import { studentsApi } from '@/services/studentsApi';

const emptyAdministrator = {
  name: '',
  loginNumber: '',
  password: '',
  nationalId: '',
  phone: '',
  jobTitle: 'إداري',
  permissions: [],
};

const AdministratorsSection = () => {
  const { toast } = useToast();
  const [administrators, setAdministrators] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyAdministrator);
  const [selectedAdministrator, setSelectedAdministrator] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadAdministrators = async () => {
    setIsLoading(true);
    try {
      setAdministrators(await studentsApi.getAdministrators());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAdministrators().catch((error) => {
      toast({ title: 'تعذر تحميل الإداريين', description: error.message, variant: 'destructive' });
    });
  }, [toast]);

  const visibleAdministrators = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return administrators;
    return administrators.filter((administrator) =>
      [administrator.name, administrator.loginNumber, administrator.phone, administrator.jobTitle]
        .some((value) => String(value || '').toLowerCase().includes(term))
    );
  }, [administrators, search]);

  const openAddDialog = () => {
    setSelectedAdministrator(null);
    setForm(emptyAdministrator);
    setDialog('form');
  };

  const openEditDialog = (administrator) => {
    if (administrator.role === 'manager') return;
    setSelectedAdministrator(administrator);
    setForm({
      name: administrator.name || '',
      loginNumber: administrator.loginNumber || '',
      password: '',
      nationalId: administrator.nationalId || '',
      phone: administrator.phone || '',
      jobTitle: administrator.jobTitle || 'إداري',
      permissions: normalizeDashboardPermissions(administrator.permissions),
    });
    setDialog('form');
  };

  const togglePermission = (permission) => {
    setForm((current) => {
      const selected = Array.isArray(current.permissions) ? current.permissions : [];
      const exists = selected.includes(permission);
      return {
        ...current,
        permissions: exists ? selected.filter((item) => item !== permission) : [...selected, permission],
      };
    });
  };

  const saveAdministrator = async () => {
    setIsSaving(true);
    try {
      if (selectedAdministrator) {
        await studentsApi.updateAdministrator(selectedAdministrator.id, form);
        toast({ title: 'تم التحديث', description: 'تم تحديث بيانات الإداري.' });
      } else {
        await studentsApi.createAdministrator(form);
        toast({ title: 'تم الحفظ', description: 'تم إنشاء حساب الإداري.' });
      }
      setDialog(null);
      setSelectedAdministrator(null);
      setForm(emptyAdministrator);
      await loadAdministrators();
    } catch (error) {
      toast({ title: 'تعذر الحفظ', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = (administrator) => {
    if (administrator.role === 'manager') return;
    setSelectedAdministrator(administrator);
    setDialog('delete');
  };

  const deleteAdministrator = async () => {
    if (!selectedAdministrator) return;
    setIsSaving(true);
    try {
      await studentsApi.deleteAdministrator(selectedAdministrator.id);
      toast({ title: 'تم الحذف', description: 'تم حذف الإداري.' });
      setDialog(null);
      setSelectedAdministrator(null);
      await loadAdministrators();
    } catch (error) {
      toast({ title: 'تعذر الحذف', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const _resolveAdministratorsSection = () => {
    if (isLoading) {
      return <DashboardLoader />;
    }
    if (visibleAdministrators.length === 0) {
      return <ManagementEmpty>لا يوجد إداريون حالياً.</ManagementEmpty>;
    }
    const actionClass = 'h-11 w-11 border-transparent bg-transparent';
    return <ManagementList label="الإداريون">
      {visibleAdministrators.map((administrator) => {
        const isManager = administrator.role === 'manager';
        return (
          <ManagementRow
            key={administrator.id}
            icon={<ShieldCheck className="h-4 w-4 shrink-0 text-primary" />}
            title={administrator.name}
            subtitle={isManager ? 'مدير المجمع' : (administrator.jobTitle || 'إداري')}
            onOpen={isManager ? undefined : () => openEditDialog(administrator)}
            openLabel={`تعديل ${administrator.name}`}
            actions={isManager ? null : <>
              <ManagementIconButton className={actionClass} onClick={() => openEditDialog(administrator)} title="تعديل" aria-label={`تعديل ${administrator.name}`} tone="primary">
                <Edit3 className="h-4 w-4" />
              </ManagementIconButton>
              <ManagementIconButton className={actionClass} onClick={() => confirmDelete(administrator)} title="حذف" aria-label={`حذف ${administrator.name}`} tone="destructive">
                <Trash2 className="h-4 w-4" />
              </ManagementIconButton>
            </>}
          />
        );
      })}
    </ManagementList>;
  };
  return (
    <>
      <ManagementToolbar>
        <Input
          type="search"
          aria-label="ابحث باسم الإداري"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="ابحث باسم الإداري"
          className="h-11 flex-1 basis-56"
        />
        <Button onClick={openAddDialog} className="h-11 gap-2 px-5"><Plus className="h-4 w-4" />إضافة إداري</Button>
      </ManagementToolbar>
      {_resolveAdministratorsSection()}

      <Dialog open={dialog === 'form'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">
              {selectedAdministrator ? 'تعديل الإداري' : 'إضافة إداري'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormGrid>
              <FormField label="اسم الإداري" htmlFor="administrator-name">
                <Input id="administrator-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </FormField>
              <FormField label="المسمى" htmlFor="administrator-job-title">
                <Input id="administrator-job-title" value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} />
              </FormField>
              <FormField label="رقم الدخول" htmlFor="administrator-login-number">
                <Input id="administrator-login-number" value={form.loginNumber} onChange={(event) => setForm({ ...form, loginNumber: event.target.value })} />
              </FormField>
              <FormField label={selectedAdministrator ? "كلمة مرور جديدة" : "كلمة المرور"} htmlFor="administrator-password">
                <PasswordInput id="administrator-password" autoComplete="new-password" required={!selectedAdministrator} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} />
              </FormField>
              <FormField label="رقم الجوال" htmlFor="administrator-phone">
                <Input id="administrator-phone" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </FormField>
              <FormField label="رقم الهوية" htmlFor="administrator-national-id">
                <Input id="administrator-national-id" inputMode="numeric" value={form.nationalId} onChange={(event) => setForm({ ...form, nationalId: event.target.value })} />
              </FormField>
              <FormField label="الصلاحيات" htmlFor="administrator-permissions" wide>
                <PermissionChecklist id="administrator-permissions" value={form.permissions} onToggle={togglePermission} />
              </FormField>
            </FormGrid>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button onClick={saveAdministrator} loading={isSaving}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="bg-card border-primary/30 text-foreground" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-primary neon-text">تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="py-4 text-muted-foreground">
            هل تريد حذف الإداري {selectedAdministrator?.name}؟ سيُحذف سجل حضوره أيضًا، ولا يمكن التراجع عن الحذف.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={deleteAdministrator} loading={isSaving}>حذف</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdministratorsSection;
