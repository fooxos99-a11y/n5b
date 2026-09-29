import React, { useEffect, useState } from 'react';
import { Award, Crown, Star, Trophy } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { studentsApi } from '@/services/studentsApi';
import { loadPublicSettingsCached } from '@/services/publicSettingsCache';
import { formatPointsNumber } from '@/lib/pointsFormat';

const formatNumber = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');
const normalizeRows = (rows = []) => rows.filter((row) => row?.name).map((row, index) => ({
  ...row,
  rank: Number(row.rank || index + 1),
  points: Number(row.points || 0),
}));

const demoStudents = [
  ['أحمد محمد', 'حلقة الإتقان', 982],
  ['خالد سليمان', 'حلقة الهدى', 947],
  ['عبدالله ناصر', 'حلقة الفرقان', 921],
  ['يوسف إبراهيم', 'حلقة النور', 885],
  ['سلمان فهد', 'حلقة البيان', 842],
  ['أنس عبدالرحمن', 'حلقة الإتقان', 809],
  ['عمر صالح', 'حلقة الهدى', 776],
  ['محمد وليد', 'حلقة الفرقان', 741],
].map(([name, committeeName, points], index) => ({ id: `demo-student-${index}`, name, committeeName, points, rank: index + 1 }));

const demoFamilies = [
  ['حلقة الإتقان', 5240],
  ['حلقة الهدى', 4895],
  ['حلقة الفرقان', 4510],
  ['حلقة النور', 4180],
  ['حلقة البيان', 3890],
  ['حلقة الريان', 3615],
  ['حلقة الماهر', 3370],
  ['حلقة الترتيل', 3120],
].map(([name, points], index) => ({ id: `demo-family-${index}`, name, points, rank: index + 1 }));

const withDevelopmentDemo = (rows, fallback) => (
  import.meta.env.DEV && rows.length === 0 ? fallback : rows
);

const topRankMeta = {
  1: {
    label: 'المركز الأول',
    icon: Crown,
    iconClassName: 'text-amber-500 dark:text-amber-300',
    rowClassName: 'border-amber-400/80 bg-gradient-to-l from-amber-400/10 via-amber-400/[.04] to-transparent',
    accentClassName: 'bg-amber-400',
  },
  2: {
    label: 'المركز الثاني',
    icon: Award,
    iconClassName: 'text-sky-500 dark:text-sky-300',
    rowClassName: 'border-sky-400/75 bg-gradient-to-l from-sky-400/10 via-sky-400/[.04] to-transparent',
    accentClassName: 'bg-sky-400',
  },
  3: {
    label: 'المركز الثالث',
    icon: Award,
    iconClassName: 'text-orange-500 dark:text-orange-300',
    rowClassName: 'border-orange-400/80 bg-gradient-to-l from-orange-400/10 via-orange-400/[.04] to-transparent',
    accentClassName: 'bg-orange-400',
  },
};

const defaultRankMeta = {
  rowClassName: 'border-primary/55 bg-gradient-to-l from-primary/[.08] via-primary/[.03] to-transparent',
  accentClassName: 'bg-primary',
};

const RankingMark = ({ rank }) => {
  const meta = topRankMeta[rank];
  if (!meta) {
    return (
      <span className="grid h-9 w-9 place-items-center text-sm font-black tabular-nums text-muted-foreground" aria-label={`المركز ${formatNumber(rank)}`}>
        {formatNumber(rank)}
      </span>
    );
  }
  const Icon = meta.icon;
  return (
    <span className={`relative grid h-9 w-9 place-items-center ${meta.iconClassName}`} aria-label={meta.label}>
      <span className="absolute h-7 w-7 bg-current/15 blur-lg" aria-hidden="true" />
      <Icon className="relative h-5 w-5 drop-shadow-[0_3px_8px_currentColor]" aria-hidden="true" />
    </span>
  );
};

const RankingRow = ({ item, showPoints, family = false }) => {
  const rankMeta = topRankMeta[item.rank] || defaultRankMeta;
  return (
    <li className={`relative grid min-h-[4.25rem] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-2xl border px-4 py-2.5 sm:min-h-[4.75rem] sm:px-5 ${rankMeta.rowClassName}`}>
      <span className={`absolute inset-y-3 right-0 w-1 rounded-l-full ${rankMeta.accentClassName}`} aria-hidden="true" />
      <RankingMark rank={item.rank} />
      <span className="min-w-0">
        <span className="block truncate text-base font-black text-foreground sm:text-lg">{item.name}</span>
        {!family && item.committeeName && <span className="mt-0.5 block truncate text-[11px] font-bold text-muted-foreground sm:text-xs">{item.committeeName}</span>}
      </span>
      {showPoints ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-black text-primary"><Star className="h-4 w-4" />{formatPointsNumber(item.points)}</span>
      ) : (
        <span className="text-sm font-black text-muted-foreground">#{formatNumber(item.rank)}</span>
      )}
    </li>
  );
};

const RankingPanel = ({ title, rows, showPoints, family = false }) => (
  <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_18px_50px_hsl(var(--foreground)/.07)] dark:shadow-[0_18px_50px_rgba(0,0,0,.22)]">
    <header className="flex items-center justify-center gap-2.5 px-5 py-5">
      <h3 className="text-lg font-black text-primary sm:text-xl">{title}</h3>
    </header>
    {rows.length ? (
      <ol className="space-y-2.5 px-3 pb-4 sm:px-5 sm:pb-5">{rows.slice(0, 8).map((item) => <RankingRow key={item.id} item={item} showPoints={showPoints} family={family} />)}</ol>
    ) : (
      <p className="flex min-h-36 items-center justify-center px-5 text-center text-sm font-bold text-muted-foreground">لا توجد بيانات ترتيب حاليًا.</p>
    )}
  </article>
);

const NukhabPublicRankings = () => {
  const [state, setState] = useState({ loading: true, settings: null, families: [], students: [] });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const settings = await loadPublicSettingsCached().catch(() => ({
          studentRankingsVisible: true,
          familyRankingsVisible: true,
          rankingPointsVisible: true,
        }));
        const [students, families] = await Promise.all([
          settings.studentRankingsVisible === false ? [] : studentsApi.getStudentRankings({ committeeId: 'all' }).catch(() => []),
          settings.familyRankingsVisible === false ? [] : studentsApi.getFamilyRankings().catch(() => []),
        ]);
        if (mounted) setState({
          loading: false,
          settings,
          students: withDevelopmentDemo(normalizeRows(students), demoStudents),
          families: withDevelopmentDemo(normalizeRows(families), demoFamilies),
        });
      } catch {
        if (mounted) setState({ loading: false, settings: null, students: [], families: [] });
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  if (state.loading) return <section id="public-rankings" className="grid min-h-72 place-items-center border-b border-border bg-secondary/25" aria-label="تحميل لوحة التميز"><LoadingSpinner /></section>;
  const studentVisible = state.settings?.studentRankingsVisible !== false;
  const familyVisible = state.settings?.familyRankingsVisible !== false;
  if (!studentVisible && !familyVisible) return null;

  return (
    <section id="public-rankings" className="relative scroll-mt-20 overflow-hidden border-b border-border bg-secondary/25 px-4 py-16 [font-family:var(--font-ui)] sm:px-6 sm:py-20 lg:px-8" dir="rtl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/.10),transparent_68%)]" aria-hidden="true" />
      <div className="mx-auto w-full max-w-7xl">
        <div className="relative mx-auto mb-9 max-w-2xl text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Trophy className="h-6 w-6" /></span>
          <h2 className="mt-4 text-3xl font-black text-foreground sm:text-4xl">لوحة التميز</h2>
        </div>
        <div className={`relative grid gap-6 ${studentVisible && familyVisible ? 'lg:grid-cols-2' : 'mx-auto max-w-2xl'}`}>
          {familyVisible && <RankingPanel title="أفضل الحلقات" rows={state.families} showPoints={state.settings?.rankingPointsVisible !== false} family />}
          {studentVisible && <RankingPanel title="أفضل الطلاب" rows={state.students} showPoints={state.settings?.rankingPointsVisible !== false} />}
        </div>
      </div>
    </section>
  );
};

export default NukhabPublicRankings;
