import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Edit3, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import DashboardLoader from '@/components/dashboard/DashboardLoader';
import ManagementIconButton from '@/components/ui/management-icon-button';
import { FormField, FormGrid, ManagementEmpty, ManagementList, ManagementRow, ManagementToolbar } from '@/components/dashboard/layout/ManagementPanel';
import { dashboardPermissionOptions } from '@/lib/dashboardPermissions';
import useMediaQuery from '@/hooks/useMediaQuery';
import { studentsApi } from '@/services/studentsApi';

const emptyAdministrator = {
  name: '',
  loginNumber: '',
  nationalId: '',
  phone: '',
  jobTitle: 'إداري',
  permissions: [],
};

const adminPermissionOptions = dashboardPermissionOptions.filter((option) => option.key !== 'quranEvaluation');

const selectedLabels = (selected = []) => {
  const values = new Set((Array.isArray(selected) ? selected : []).map(String));
  return adminPermissionOptions.filter((option) => values.has(option.key)).map((option) => option.label);
};

const PermissionsTrigger = React.forwardRef(({ id, labels, open, onClick, disabled, ...triggerProps }, ref) => (
  <button
    ref={ref}
    id={id}
    type="button"
    disabled={disabled}
    aria-haspopup="listbox"
    aria-expanded={open}
    onClick={onClick}
    className="select-trigger-solid relative flex min-h-12 w-full items-center rounded-md border border-primary/30 bg-background py-2.5 pl-10 pr-3 text-right text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    {...triggerProps}
  >
    {labels.length ? (
      <span className="flex min-w-0 flex-1 flex-wrap gap-1.5 pl-2 text-foreground">
        {labels.map((label) => (
          <span key={label} className="max-w-full whitespace-normal break-words rounded-md border border-primary/15 bg-primary/10 px-2 py-1 text-xs font-bold leading-5">
            {label}
          </span>
        ))}
      </span>
    ) : <span className="text-muted-foreground">اختر الصلاحيات</span>}
    <ChevronDown className={`absolute left-3 h-4 w-4 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} />
  </button>
));
PermissionsTrigger.displayName = 'PermissionsTrigger';

const PermissionOptionsList = ({ values, onToggle, className = '' }) => (
  <div
    role="listbox"
    aria-label="صلاحيات الصفحات"
    aria-multiselectable="true"
    className={`text-right text-foreground ${className}`}
  >
    {adminPermissionOptions.map((option) => {
      const selected = values.has(option.key);
      return (
        <button
          key={option.key}
          type="button"
          role="option"
          aria-selected={selected}
          onClick={() => onToggle(option.key)}
          className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-right outline-none transition focus-visible:ring-2 focus-visible:ring-primary/50 ${
            selected
              ? 'border-primary/25 bg-primary/10 text-popover-foreground'
              : 'border-transparent bg-popover text-popover-foreground hover:border-primary/15 hover:bg-primary/5'
          }`}
        >
          <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-black leading-6 text-popover-foreground">
            {option.label}
          </span>
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/25 bg-background'}`}>
            {selected && <Check className="h-4 w-4" />}
          </span>
        </button>
      );
    })}
  </div>
);

const PermissionsSelect = ({ id, value, onToggle, disabled = false }) => {
  const isMobile = useMediaQuery('(max-width: 639px)');
  const labels = selectedLabels(value);
  const values = new Set((Array.isArray(value) ? value : []).map(String));
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        <PermissionsTrigger
          id={id}
          labels={labels}
          open={open}
          onClick={() => setOpen(true)}
          disabled={disabled}
        />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="grid h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-3 [font-family:var(--font-ui)]"
            dir="rtl"
          >
            <DialogHeader>
              <DialogTitle>الصلاحيات</DialogTitle>
            </DialogHeader>
            <PermissionOptionsList
              values={values}
              onToggle={onToggle}
              className="min-h-0 space-y-1 overflow-y-auto overscroll-contain touch-pan-y [-webkit-overflow-scrolling:touch]"
            />
            <DialogFooter>
              <Button type="button" onClick={() => setOpen(false)}>تم</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <PermissionsTrigger
          id={id}
          labels={labels}
          open={open}
          onClick={undefined}
          disabled={disabled}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="z-[160] max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain p-1.5 text-popover-foreground touch-pan-y [-webkit-overflow-scrolling:touch] sm:min-w-[26rem]"
        dir="rtl"
      >
        <PermissionOptionsList values={values} onToggle={onToggle} className="space-y-1" />
      </PopoverContent>
    </Popover>
  );
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
      nationalId: administrator.nationalId || '',
      phone: administrator.phone || '',
      jobTitle: administrator.jobTitle || 'إداري',
      permissions: administrator.permissions || [],
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
              <FormField label="رقم الجوال" htmlFor="administrator-phone">
                <Input id="administrator-phone" inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </FormField>
              <FormField label="رقم الهوية" htmlFor="administrator-national-id">
                <Input id="administrator-national-id" inputMode="numeric" value={form.nationalId} onChange={(event) => setForm({ ...form, nationalId: event.target.value })} />
              </FormField>
              <FormField label="الصلاحيات" htmlFor="administrator-permissions" wide>
                <PermissionsSelect id="administrator-permissions" value={form.permissions} onToggle={togglePermission} />
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
