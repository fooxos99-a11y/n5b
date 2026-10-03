import React, { useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DatePicker from '../../src/components/ui/date-picker';
import WeekStartPicker from '../../src/components/dashboard/grades/WeekStartPicker';
import OwnerAnalyticsFilters from '../../src/components/owner/OwnerAnalyticsFilters';
import OwnerPolicySetting from '../../src/components/owner/OwnerPolicySetting';
import CallsSection from '../../src/components/calls/CallsSection';
import NewsEntryDialog from '../../src/components/dashboard/NewsEntryDialog';
import { Button } from '../../src/components/ui/button';
import { studentsApi } from '../../src/services/studentsApi';
import '../../src/index.css';
if (!import.meta.env.DEV || !['localhost', '127.0.0.1'].includes(location.hostname)) throw new Error('Local only');
function Fixture() {
  const [value, setValue] = useState('2026-10-02');
  const [range, setRange] = useState(null);
  const [week, setWeek] = useState('2026-09-27');
  const [filters, setFilters] = useState({ from: '2026-09-12', to: '2026-10-02', complexIds: [], compare: '', committeeId: '', teacherId: '' });
  const [policy, setPolicy] = useState('tenant');
  const [news, setNews] = useState(false);
  const [saved, setSaved] = useState(null);
  const [callsMode, setCallsMode] = useState('missing');
  const [callsRetry, setCallsRetry] = useState(false);
  studentsApi.getCallRooms = async () => {
    if (callsMode === 'error' && !callsRetry) throw new Error('تعذر الاتصال بالخادم');
    return { livekitConfigured: callsMode !== 'missing', canCreate: true, canCreateGeneral: true, committees: [{ id: '1', name: 'حلقة الفحص' }], rooms: [] };
  };
  studentsApi.createCallRoom = async body => { setSaved(body); return { ok: true, id: '1' }; };
  const loadAvailableDates = useCallback(async (requestedRange) => {
    setRange(requestedRange);
    return ['2026-10-01', '2026-10-02', '2026-10-03'];
  }, []);
  return <main dir="rtl" className="mx-auto max-w-5xl space-y-4 p-4">
    <DatePicker value={value} onChange={setValue} min="2026-10-02" max="2026-10-03" loadAvailableDates={loadAvailableDates} />
    <output data-date>{value}</output><output data-range>{JSON.stringify(range)}</output>
    <OwnerAnalyticsFilters filters={filters} complexes={[]} filterOptions={{}} onChange={setFilters} />
    <output data-filters>{JSON.stringify(filters)}</output>
    <OwnerPolicySetting definition={{ key: 'start', label: 'بداية الفصل', type: 'date' }} policy={policy} value={value} onPolicyChange={setPolicy} onValueChange={setValue} />
    <section className="max-w-sm"><WeekStartPicker value={week} currentWeekStart="2026-09-27" onChange={setWeek} /><output data-week>{week}</output></section>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setNews(true)}>فحص الخبر</Button>
      {['missing', 'ready', 'error'].map(mode => <Button key={mode} onClick={() => { setCallsMode(mode); setCallsRetry(false); }}>{mode}</Button>)}
      <Button onClick={() => setCallsRetry(true)}>إصلاح الاتصال</Button>
    </div>
    <CallsSection key={callsMode} />
    {news && <NewsEntryDialog entry={{ title: 'خبر الفحص', body: '', startsAt: '2026-10-02', endsAt: '2026-10-03', committeeIds: [] }} committees={[]} pending={false} onClose={() => setNews(false)} onSave={body => { setSaved(body); setNews(false); }} />}
    <output data-saved className="block break-all">{JSON.stringify(saved)}</output>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
