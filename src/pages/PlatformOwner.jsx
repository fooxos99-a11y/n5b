import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from '@/lib/router';
import { Building2, LayoutDashboard, Settings2 } from 'lucide-react';
import DashboardShell from '@/components/dashboard/DashboardShell';
import LoadingScreen from '@/components/LoadingScreen';
import OwnerComplexDetailsSection from '@/components/owner/OwnerComplexDetailsSection';
import OwnerComplexDialog from '@/components/owner/OwnerComplexDialog';
import OwnerComplexesSection from '@/components/owner/OwnerComplexesSection';
import OwnerAnalyticsSection from '@/components/owner/OwnerAnalyticsSection';
import OwnerSettingsSection from '@/components/owner/OwnerSettingsSection';
import { useToast } from '@/components/ui/use-toast';
import { normalizeNumericInput } from '@/lib/numericInput';
import { platformApi } from '@/services/platformApi';
import { useSiteConfig } from '@/site/SiteProvider';

const emptyComplexForm = {
  name: '',
  registrationNumber: '',
  contactName: '',
  contactPhone: '',
  managerName: '',
  managerLoginNumber: '',
};

const ownerSections = [
  { key: 'overview', label: 'الإحصائيات', icon: LayoutDashboard },
  { key: 'complexes', label: 'المجمعات', icon: Building2 },
  { key: 'settings', label: 'الإعدادات', icon: Settings2 },
];
const statusOrder = { active: 0, pending: 1, inactive: 2 };

const PlatformOwner = () => {
  const site = useSiteConfig();
  const navigate = useNavigate();
  const { section = '' } = useParams();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [complexes, setComplexes] = useState([]);
  const [complexesError, setComplexesError] = useState('');
  const [busy, setBusy] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingComplex, setEditingComplex] = useState(null);
  const [complexForm, setComplexForm] = useState(emptyComplexForm);
  const [search, setSearch] = useState('');

  const visibleComplexes = useMemo(() => {
    const query = search.trim().toLowerCase();
    return complexes
      .filter((complex) => (
        !query || [complex.name, complex.registrationNumber, complex.managerName]
        .some((value) => String(value || '').toLowerCase().includes(query))
      ))
      .sort((left, right) => (
        (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99)
        || String(left.name || '').localeCompare(String(right.name || ''), 'ar')
      ));
  }, [complexes, search]);

  const loadComplexes = async () => {
    setComplexesError('');
    try {
      const rows = await platformApi.getComplexes();
      setComplexes(Array.isArray(rows) ? rows : []);
    } catch (error) {
      setComplexesError(error.message || 'تعذر تحميل المجمعات.');
      throw error;
    }
  };

  const detailsMatch = /^complex-(\d+)$/.exec(section);
  const detailsId = detailsMatch ? Number(detailsMatch[1]) : null;
  const _resolveActiveSection = () => {
    if (detailsId) {
      return 'overview';
    }
    if (['complexes', 'settings'].includes(section)) {
      return section;
    }
    return 'overview';
  };
  const activeSection = _resolveActiveSection();

  useEffect(() => {
    if (!section || (!detailsId && !['overview', 'complexes', 'settings'].includes(section))) navigate('/dashboard/platform/overview', { replace: true });
  }, [detailsId, navigate, section]);

  useEffect(() => {
    if (!platformApi.hasSession()) {
      navigate('/', { replace: true });
      return undefined;
    }
    loadComplexes()
      .catch((error) => {
        toast({ title: 'تعذر تحميل المجمعات', description: error.message, variant: 'destructive' });
        if (error.status === 401) navigate('/', { replace: true });
      })
      .finally(() => setIsLoading(false));
  }, [navigate, toast]);

  const openCreate = () => {
    setEditingComplex(null);
    setComplexForm(emptyComplexForm);
    setDialogOpen(true);
  };

  const openEdit = (complex) => {
    setEditingComplex(complex);
    setComplexForm({
      name: complex.name || '',
      registrationNumber: complex.registrationNumber || '',
      contactName: complex.contactName || '',
      contactPhone: complex.contactPhone || '',
      managerName: complex.managerName || '',
      managerLoginNumber: complex.managerLoginNumber || '',
    });
    setDialogOpen(true);
  };

  const updateComplexForm = (nextForm) => {
    setComplexForm({
      ...nextForm,
      registrationNumber: normalizeNumericInput(nextForm.registrationNumber),
      managerLoginNumber: normalizeNumericInput(nextForm.managerLoginNumber),
    });
  };

  const saveComplex = async () => {
    setBusy('complex');
    try {
      if (editingComplex) await platformApi.updateComplex(editingComplex.id, complexForm);
      else await platformApi.createComplex(complexForm);
      await loadComplexes();
      setDialogOpen(false);
      toast({ title: editingComplex ? 'تم تحديث المجمع' : 'تمت إضافة المجمع' });
    } catch (error) {
      toast({ title: 'تعذر حفظ المجمع', description: error.message, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const changeStatus = async (complex) => {
    const nextStatus = complex.status === 'active' ? 'inactive' : 'active';
    setBusy(`status-${complex.id}`);
    try {
      await platformApi.updateComplexStatus(complex.id, nextStatus);
      await loadComplexes();
    } catch (error) {
      toast({ title: 'تعذر تغيير الحالة', description: error.message, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  };

  const logout = () => {
    const completion = platformApi.logout();
    localStorage.removeItem('wajeh_role');
    localStorage.removeItem('wajeh_name');
    setComplexes([]);
    navigate('/', { replace: true });
    void completion.catch(() => toast({
      title: 'خرجت من الحساب على هذا الجهاز',
      description: 'تعذر تأكيد إغلاق الجلسة على الخادم. تحقق من الاتصال.',
      variant: 'destructive',
    }));
  };

  if (isLoading) return <LoadingScreen />;

  const changeSection = (key) => navigate(`/dashboard/platform/${key}`);

  const _resolveContent = () => {
    if (detailsId) {
      return <OwnerComplexDetailsSection
      complexId={detailsId}
      onBack={() => navigate('/dashboard/platform/overview')}
    />;
    }
    if (activeSection === 'complexes') {
      return <OwnerComplexesSection
      complexes={complexes}
      visibleComplexes={visibleComplexes}
      search={search}
      setSearch={setSearch}
      onCreate={openCreate}
      onEdit={openEdit}
      onToggleStatus={changeStatus}
      busy={busy}
      error={complexesError}
      onRetry={() => loadComplexes().catch(() => {})}
      onOpenComplex={(id) => navigate(`/dashboard/platform/complex-${id}`)}
    />;
    }
    if (activeSection === 'settings') {
      return <OwnerSettingsSection complexes={complexes} />;
    }
    return <OwnerAnalyticsSection complexes={complexes} onOpenSettings={() => navigate('/dashboard/platform/settings')} onOpenComplex={(id) => navigate(`/dashboard/platform/complex-${id}`)} />;
  };
  const content = _resolveContent();

  return (
    <DashboardShell
      title={site.name}
      sections={ownerSections}
      activeSection={activeSection}
      onSectionChange={changeSection}
      onLogout={logout}
    >
      {content}

      <OwnerComplexDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingComplex={editingComplex}
        form={complexForm}
        setForm={updateComplexForm}
        onSave={saveComplex}
        saving={busy === 'complex'}
      />
    </DashboardShell>
  );
};

export default PlatformOwner;
