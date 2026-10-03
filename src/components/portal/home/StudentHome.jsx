import StudentNewsCard from './StudentNewsCard';
import React, { lazy, Suspense, useEffect, useState } from 'react';
import useMediaQuery from '@/hooks/useMediaQuery';
import useStudentHomeNavigation from '@/hooks/useStudentHomeNavigation';
import StudentBottomNavigation from './StudentBottomNavigation';
import StudentHomeStatus from './StudentHomeStatus';
import LoadingIndicator from '@/components/ui/loading-indicator';
import PageLoadingBoundary from '@/components/ui/page-loading-boundary';
import useStudentPlan from '@/hooks/useStudentPlan';
import useSaudiClock from '@/hooks/useSaudiClock';
import { useSiteConfig } from '@/site/SiteProvider';
import { getBusinessDate } from '../../../../shared/business-date.js';
import { studentHomePlan, studentHomeFeatures } from '@/lib/studentHome';
import { loadStudentHomeExtras, loadStudentLevel } from '@/services/studentHomeService';
import StudentHomeHeader from './StudentHomeHeader';
import StudentTodayCard from './StudentTodayCard';
import StudentHomeRankings from './StudentHomeRankings';
import StudentHomeWindow from './StudentHomeWindow';
import LazyAudioCallRoom from '@/components/calls/LazyAudioCallRoom';
import './student-home.css';

const Sessions = lazy(() => import('./StudentSessions'));
const Mushaf = lazy(() => import('@/components/portal/StudentMushafSection'));
const Store = lazy(() => import('@/components/portal/StudentStoreSection'));
const Calls = lazy(() => import('./StudentCalls'));
const titles = { sessions: 'الجلسات', mushaf: 'المصحف', store: 'المتجر', calls: 'المكالمات' };

export default function StudentHome(props) {
  return <PageLoadingBoundary key={props.studentId}><StudentHomeContent {...props} /></PageLoadingBoundary>;
}

function StudentHomeContent({ studentId, onLogout }) {
  const site = useSiteConfig();
  const today = getBusinessDate(useSaudiClock());
  const plan = useStudentPlan(studentId, today);
  const [planReady, setPlanReady] = useState(false);
  useEffect(() => { if (!plan.loading) setPlanReady(true); }, [plan.loading]);
  const [level, setLevel] = useState(null);
  // The level follows the approved memorization, so it refreshes with the plan.
  useEffect(() => {
    let active = true;
    loadStudentLevel(studentId).then((value) => { if (active) setLevel(value); }).catch(() => { if (active) setLevel(null); });
    return () => { active = false; };
  }, [studentId, today]);
  const [extras, setExtras] = useState(null);
  const [extrasReady, setExtrasReady] = useState(false);
  const [version, setVersion] = useState(0);
  const { view: requestedView, open: navigate, back } = useStudentHomeNavigation();
  const mobile = useMediaQuery('(max-width: 899px)');
  const [target, setTarget] = useState(null);
  const [activeCallRoom, setActiveCallRoom] = useState(null);
  const [callDisplayTarget, setCallDisplayTarget] = useState(null);

  const [sessionTab, setSessionTab] = useState('evaluation');
  const [openJuzs, setOpenJuzs] = useState({});
  const [sessionVisited, setSessionVisited] = useState(requestedView === 'sessions');
  useEffect(() => {
    let active = true;
    loadStudentHomeExtras({ refresh: true, onUpdate: (update) => { if (active) setExtras((current) => ({ ...current, ...update })); } }).then((data) => { if (active) { setExtras(data); setExtrasReady(true); } });
    return () => { active = false; };
  }, [today, version]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') setVersion(value => value + 1); };
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, []);
  const features = studentHomeFeatures(extras?.settings, site.features);
  const view = features[requestedView] ? requestedView : null;
  const open = (key) => { if (key === 'sessions') { setSessionVisited(true); }
    navigate(key); };
  const close = () => {
    back();
    if (view === 'sessions') { setVersion((value) => value + 1); void plan.retry(); }
  };
  const read = (next) => { setTarget(next); navigate('mushaf'); };
  const leaveReader = back;
  const storeEnabled = features.store;
  const model = studentHomePlan(plan.data?.today, today, false);
  const fullPage = view === 'mushaf';
  const entering = !planReady || !extrasReady;
  return <div className="student-home" dir="rtl">
    {entering && <LoadingIndicator mode="screen" delayMs={0} />}
    <div hidden={entering} inert={(mobile && view) || fullPage || view === 'store' ? '' : undefined}>
    <StudentHomeHeader studentName={plan.data?.rows?.find(row => row.studentName)?.studentName || localStorage.getItem('wajeh_name') || ''} showProgress={Boolean(level?.name)} points={plan.data?.points?.total} progress={level?.progressPercent} levelName={level?.name} progressLabel={`تقدم ${level?.name || 'المستوى'}`} storeEnabled={storeEnabled} onOpen={open} onLogout={onLogout} />
    <main className="student-home-main">
      <StudentNewsCard news={extras?.news} active={!entering && !view} />
      <StudentTodayCard model={model} loading={plan.loading && !plan.data} error={plan.error} onRetry={plan.retry} onRead={read} />
      {extras?.settingsError && <StudentHomeStatus message="تعذر تحديث إعدادات الصفحة." onRetry={() => setVersion((value) => value + 1)} />}
      <StudentHomeRankings studentId={studentId} settings={extras?.settings} />
    </main></div>
    {!entering && !fullPage && <StudentBottomNavigation storeEnabled={storeEnabled} view={view} onNavigate={(key) => { if (key === view) { return; }
      if (key === 'mushaf') { read(null); } else { open(key); } }} />}
    {!entering && view && <StudentHomeWindow surfaceKey={view} title={titles[view]} onClose={view === 'mushaf' ? leaveReader : close} wide={view === 'mushaf'} compact={view === 'calls'}>
      <PageLoadingBoundary key={view} scope="content"><Suspense fallback={<LoadingIndicator />}>
        {(view === 'sessions' || (view === 'mushaf' && sessionVisited)) && <div hidden={view !== 'sessions'}><Sessions studentId={studentId} plan={plan} today={today} onRead={read} tab={sessionTab} onTabChange={setSessionTab} openJuzs={openJuzs} onJuzToggle={setOpenJuzs} /></div>}
        {view === 'mushaf' && <Mushaf studentId={studentId} initialTarget={target} onBack={leaveReader} />}
        {view === 'store' && <Store embedded />}
        {view === 'calls' && <Calls activeRoom={activeCallRoom} onJoinRoom={setActiveCallRoom} onDisplayTarget={setCallDisplayTarget} />}
      </Suspense></PageLoadingBoundary>
    </StudentHomeWindow>}
    {activeCallRoom && <div className="[&>button.fixed]:bottom-24 sm:[&>button.fixed]:bottom-5">
      <LazyAudioCallRoom roomInfo={activeCallRoom} isOwner={activeCallRoom.isOwner}
        displayTarget={callDisplayTarget} minimized={view !== 'calls' || !callDisplayTarget}
        onRestore={() => open('calls')} onLeave={() => setActiveCallRoom(null)} onClosed={() => setActiveCallRoom(null)} />
    </div>}
  </div>;
}
