import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View, useWindowDimensions } from 'react-native';
import { AppText } from '../components/AppText';
import { DashboardIcon } from '../components/dashboard/DashboardIcon';
import { StudentPortalTheme } from '../components/portal/StudentPortalTheme';
import { StudentPortalSurface, StudentPortalCard as SectionCard, StudentProgress } from '../components/portal/StudentPortalSurface';
import { StudentAccountMenu } from '../components/portal/StudentAccountMenu';
import { StudentNewsCard } from '../components/portal/StudentNewsCard';
import { StudentResourceStatus, type StudentResource as Resource } from '../components/portal/StudentResourceStatus';
import { StudentSessionSurface } from '../components/portal/StudentSessionSurface';
import { StudentSessionsContent } from '../components/portal/StudentSessionsContent';
import { StudentTaskAmounts } from '../components/portal/StudentTaskAmounts';
import type { StudentSessionTab } from '../components/portal/studentSessionNavigation';
import type { NativeSessionController } from '../domain/nativeSession';
import { studentDashboardError, studentPlanWeeks, studentTodayGroups,
  type StudentLevel, type StudentNewsEntry, type StudentPlanData, type StudentSavedJuz } from '../domain/studentDashboard';
import { createStudentDashboardApi } from '../services/studentDashboardApi';
import { usePalette, useTheme } from '../theme';

const emptyResource = <T,>(): Resource<T> => ({ value: null, loading: true, error: '' });
export type StudentDashboardScreenProps = {
  controller: NativeSessionController; onLogout: () => void; onAccount?: () => void; logoutLoading?: boolean;
  onNotifications?: () => void; onStore?: () => void; notificationUnreadCount?: number;
};
export function StudentDashboardScreen(props: StudentDashboardScreenProps) {
  return <StudentPortalTheme><StudentDashboardContent {...props} /></StudentPortalTheme>;
}
function StudentDashboardContent({ controller, onLogout, onNotifications, onStore, notificationUnreadCount, logoutLoading = false }: StudentDashboardScreenProps) {
  const palette = usePalette(); const api = useMemo(() => createStudentDashboardApi(controller), [controller]);
  const { width } = useWindowDimensions(); const { theme } = useTheme();
  const [plan, setPlan] = useState<Resource<StudentPlanData>>(emptyResource);
  const [level, setLevel] = useState<Resource<StudentLevel>>(emptyResource);
  const [news, setNews] = useState<Resource<StudentNewsEntry[]>>(emptyResource);
  const [saved, setSaved] = useState<Resource<StudentSavedJuz[]>>(emptyResource);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sessionTab, setSessionTab] = useState<StudentSessionTab>('evaluation');
  const [expandedJuzs, setExpandedJuzs] = useState<ReadonlySet<number>>(new Set());
  const mounted = useRef(false); const inFlight = useRef<AbortController | null>(null);
  const refresh = useCallback(async (silent = false) => {
    // Synchronous guard prevents overlapping refresh taps and foreground timers.
    if (inFlight.current) return;
    const abort = new AbortController(); inFlight.current = abort;
    if (!silent) {
      setPlan(current => ({ ...current, loading: true, error: '' })); setLevel(current => ({ ...current, loading: true, error: '' }));
      setNews(current => ({ ...current, loading: true, error: '' })); setSaved(current => ({ ...current, loading: true, error: '' }));
    }
    const apply = async <T,>(load: () => Promise<T>, set: (value: Resource<T>) => void, failure: string) => {
      try { const value = await load(); if (mounted.current && !abort.signal.aborted) set({ value, loading: false, error: '' }); }
      catch (error) { if (mounted.current && !abort.signal.aborted) set({ value: null, loading: false, error: studentDashboardError(error, failure) }); }
    };
    try {
      await Promise.all([
        apply(() => api.loadPlan({ signal: abort.signal }), setPlan, 'تعذّر تحميل الخطة.'),
        apply(() => api.loadLevel({ signal: abort.signal }), setLevel, 'تعذّر تحميل المستوى.'),
        apply(() => api.loadNews({ signal: abort.signal }), setNews, 'تعذّر تحميل الأخبار.'),
        apply(() => api.loadSaved({ signal: abort.signal }), setSaved, 'تعذّر تحميل المحفوظ.'),
      ]);
    } finally { if (inFlight.current === abort) inFlight.current = null; }
  }, [api]);
  useEffect(() => {
    mounted.current = true; void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(true); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(true); }, 60_000);
    return () => { mounted.current = false; inFlight.current?.abort(); inFlight.current = null; subscription.remove(); clearInterval(timer); };
  }, [refresh]);
  const weeks = useMemo(() => plan.value ? studentPlanWeeks(plan.value) : [], [plan.value]);
  const today = plan.value?.today; const todayGroups = today ? studentTodayGroups(today) : null;
  const identity = controller.getSnapshot().session;
  const closeSessions = () => { setSessionsOpen(false); void refresh(); };
  return <StudentPortalSurface name={identity?.name ?? ''} level={level.value?.name} progress={level.value?.progressPercent}
    accountMenu={<StudentAccountMenu points={plan.value?.overview.points.total ?? null} onSessions={() => setSessionsOpen(true)} onLogout={onLogout} logoutLoading={logoutLoading} />}
    onNotifications={onNotifications} notificationUnreadCount={notificationUnreadCount} onStore={onStore} homeActive={!sessionsOpen} onHome={closeSessions}>
    <StudentNewsCard resource={news} onRetry={() => void refresh()} />
      <SectionCard>
        <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 35, height: 35, borderRadius: 11, backgroundColor: palette.selected, alignItems: 'center', justifyContent: 'center' }}><DashboardIcon name="workspace" color={theme === 'dark' ? '#a0e3dc' : '#0b736a'} size={19} /></View>
            <AppText accessibilityRole="header" style={{ fontFamily: 'CairoExtraBold', fontSize: width >= 640 ? 22 : 19, lineHeight: 32,
              color: theme === 'dark' ? '#e9f2f1' : palette.text }}>خطة اليوم</AppText>
          </View>
          <AppText style={{ fontFamily: 'CairoBold', fontSize: 23, color: theme === 'dark' ? '#95dfd6' : '#0e887e' }}>{todayGroups?.percent ?? 0}<AppText style={{ fontSize: 12, color: theme === 'dark' ? '#95dfd6' : '#0e887e' }}>٪</AppText></AppText>
        </View>
        <StudentProgress value={todayGroups?.percent ?? 0} label="إنجاز خطة اليوم" />
        <StudentResourceStatus resource={plan} onRetry={() => void refresh()} />
        {!!todayGroups?.groups.length && <View style={{ flexDirection: 'row-reverse', gap: width >= 640 ? 13 : 8 }}>
          {todayGroups.groups.map(group => <View key={group.type} style={{ flex: 1, minWidth: 0, minHeight: width >= 640 ? 92 : 86, paddingVertical: 12, paddingHorizontal: 6,
            borderWidth: 1, borderColor: palette.border, borderRadius: 14, backgroundColor: theme === 'dark' ? '#2f4050' : palette.card, gap: 8, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4 }}><AppText style={{ fontFamily: 'CairoExtraBold', fontSize: width >= 640 ? 15 : 13, textAlign: 'center' }}>{group.label}</AppText>
              {group.complete && <DashboardIcon name="checkSquare" color={theme === 'dark' ? '#98dcbc' : '#2a9b72'} size={15} />}</View>
            {!group.complete && <StudentTaskAmounts tasks={group.tasks} compact />}
          </View>)}
        </View>}
        {today && !todayGroups?.groups.length && <AppText style={{ paddingVertical: 24, fontSize: 13, textAlign: 'center', color: palette.muted }}>{today.isPlanPaused ? 'الخطة متوقفة — لا يوجد إنجاز مطلوب اليوم.'
          : today.isSeasonalHoliday ? 'إجازة موسمية — لا يوجد إنجاز مطلوب اليوم.' : 'لا توجد مقادير لهذا اليوم.'}</AppText>}
      </SectionCard>
      <StudentResourceStatus resource={level} onRetry={() => void refresh()} />
    <StudentSessionSurface visible={sessionsOpen} onClose={closeSessions} tab={sessionTab} onStore={onStore}>
      <StudentSessionsContent plan={plan} saved={saved} weeks={weeks} tab={sessionTab} onTabChange={setSessionTab} onRetry={() => void refresh()}
        expanded={expandedJuzs} onToggle={juz => setExpandedJuzs(current => {
          const next = new Set(current); if (next.has(juz)) next.delete(juz); else next.add(juz); return next;
        })} />
    </StudentSessionSurface>
  </StudentPortalSurface>;
}
