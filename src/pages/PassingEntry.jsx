import React, { useCallback, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import DashboardShell from '@/components/dashboard/DashboardShell';
import PassingSection from '@/components/dashboard/passing/PassingSection';
import { ManagementPanel, FormField } from '@/components/dashboard/layout/ManagementPanel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { enterPassing, createPassingGuestApi } from '@/services/passingGuestApi';

const sections = [{ key: 'quranPassing', label: 'الاجتياز' }];
export default function PassingEntry({ params = {} }) {
  const [name, setName] = useState('');
  const [session, setSession] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const registrationNumber = new URLSearchParams(window.location.search).get('registrationNumber') || '';
  const expired = useCallback(() => { setSession(null); setError('انتهت جلسة الاجتياز. أدخل اسم المقرئ من جديد.'); }, []);
  const api = useMemo(() => session ? createPassingGuestApi(session.token, registrationNumber, expired) : null, [session, registrationNumber, expired]);
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    try { setSession(await enterPassing({ linkToken: params.token, name, registrationNumber })); }
    catch (cause) { setError(cause.message); }
    finally { setSaving(false); }
  };
  return <DashboardShell sections={sections} activeSection="quranPassing" showNavigation={false}>
    <Helmet><meta name="robots" content="noindex,nofollow" /><meta name="referrer" content="no-referrer" /></Helmet>
    {api ? <PassingSection api={api} /> : <div className="mx-auto max-w-md">
      <ManagementPanel><form className="space-y-4 p-4 sm:p-6" onSubmit={submit}>
        <FormField label="اسم المقرئ" htmlFor="passing-reciter-name">
          <Input id="passing-reciter-name" autoFocus autoComplete="name" value={name} onChange={event => setName(event.target.value)}
            minLength={2} maxLength={160} required disabled={saving} className="min-h-11" />
        </FormField>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="min-h-11 w-full" loading={saving} disabled={saving || name.trim().length < 2}>دخول</Button>
      </form></ManagementPanel>
    </div>}
  </DashboardShell>;
}
