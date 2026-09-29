import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, Diamond, Flame, Medal, Sparkles, Star, Swords, Trophy, Zap } from 'lucide-react';
import LoadingSpinner from '@/components/ui/loading-spinner';
import { studentsApi } from '@/services/studentsApi';
import FamilyRankingMarquee from '@/components/public/FamilyRankingMarquee';
import PublicHeroBackground from '@/components/public/PublicHeroBackground';
import { formatPointsNumber } from '@/lib/pointsFormat';

const rankIcons = [Crown, Diamond, Swords, Trophy, Zap, Medal, Flame, Sparkles];

const formatNumber = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');

const studentStyle = (rank) => {
  if (rank === 1) return { border: '#f8c84e', glow: 'rgba(248,200,78,.24)', color: '#ffd86b' };
  if (rank === 2) return { border: '#afc8ff', glow: 'rgba(175,200,255,.18)', color: '#bfd2ff' };
  if (rank === 3) return { border: '#ff9d5c', glow: 'rgba(255,157,92,.18)', color: '#ffb985' };
  return { border: 'var(--brand-navigation-accent)', glow: 'color-mix(in srgb, var(--brand-navigation-accent) 18%, transparent)', color: 'var(--brand-navigation-accent)' };
};

const normalizeRows = (rows = []) => rows.filter((row) => row?.name).map((row, index) => ({
  ...row,
  rank: Number(row.rank || index + 1),
  points: Number(row.points || 0),
}));

const StudentRankingCard = ({ item, index, showPoints }) => {
  const style = studentStyle(item.rank);
  const Icon = rankIcons[(item.rank + Number(item.id || index) - 1) % rankIcons.length];

  return (
    <motion.article
      initial={{ opacity: 0, x: 24 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.04 }}
      className="relative grid min-h-[5.5rem] grid-cols-[88px_minmax(0,1fr)_48px] items-center gap-2 overflow-hidden rounded-2xl border px-4 py-4 shadow-xl backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 sm:min-h-24 sm:grid-cols-[124px_minmax(0,1fr)_60px] sm:gap-4 sm:px-5"
      style={{
        background: 'linear-gradient(145deg, color-mix(in srgb, var(--brand-navigation-highlight) 17%, var(--brand-navigation)), var(--brand-navigation))',
        borderColor: style.border,
        boxShadow: `0 0 0 1px ${style.glow}, 0 18px 42px ${style.glow}`,
      }}
      dir="ltr"
    >
      <span className="absolute inset-y-0 right-0 w-1.5" style={{ backgroundColor: style.border }} />
      <span className="relative z-10 flex items-center justify-start gap-1.5 text-left">
        {showPoints ? (
          <><Star className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.6} style={{ color: style.color }} /><span className="text-lg font-black sm:text-2xl" style={{ color: style.color }}>{formatPointsNumber(item.points)}</span></>
        ) : (
          <span className="text-lg font-black sm:text-2xl" style={{ color: style.color }}>#{formatNumber(item.rank)}</span>
        )}
      </span>
      <span className="relative z-10 min-w-0 text-right" dir="rtl">
        <span className="block truncate text-lg font-black leading-snug text-white sm:text-2xl">{item.name}</span>
        {item.committeeName && <span className="mt-1 block truncate text-sm font-bold text-white/55">{item.committeeName}</span>}
      </span>
      <span className="relative z-10 flex h-12 w-12 items-center justify-center sm:h-14 sm:w-14">
        <Icon className="h-8 w-8 drop-shadow-lg sm:h-9 sm:w-9" strokeWidth={2.35} style={{ color: style.color }} />
      </span>
    </motion.article>
  );
};

const StudentRankingList = ({ items, showPoints }) => {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-6" dir="rtl">
      <h2 className="nukhab-ranking-title mb-6 flex items-center justify-center gap-3 text-center text-3xl font-black text-[var(--brand-navigation-accent)]">
        <Trophy className="h-8 w-8" />
        أفضل الطلاب
      </h2>
      <div className="space-y-4">
        {items.length ? items.slice(0, 20).map((item, index) => <StudentRankingCard key={item.id} item={item} index={index} showPoints={showPoints} />) : (
          <div className="flex min-h-28 items-center justify-center rounded-2xl border border-white/15 bg-[color-mix(in_srgb,var(--brand-navigation-highlight)_12%,var(--brand-navigation))] px-5 text-center text-sm font-bold text-white/60">
            لا توجد بيانات ترتيب للطلاب حاليًا.
          </div>
        )}
      </div>
    </div>
  );
};

const PublicRankingsSection = () => {
  const [settings, setSettings] = useState(null);
  const [families, setFamilies] = useState([]);
  const [students, setStudents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadRankings = async () => {
      try {
        const publicSettings = await studentsApi.getPublicSettings().catch(() => ({
          studentRankingsVisible: true,
          familyRankingsVisible: true,
          familyRankingMode: 'total',
          rankingPointsVisible: true,
        }));
        if (!mounted) return;
        const studentVisible = publicSettings.studentRankingsVisible !== false;
        const familyVisible = publicSettings.familyRankingsVisible !== false;
        const [studentRows, familyRows] = await Promise.all([
          studentVisible ? studentsApi.getStudentRankings({ committeeId: 'all' }).catch(() => []) : [],
          familyVisible ? studentsApi.getFamilyRankings().catch(() => []) : [],
        ]);
        if (!mounted) return;
        setSettings(publicSettings);
        setStudents(normalizeRows(studentRows));
        setFamilies(normalizeRows(familyRows));
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    loadRankings();
    return () => { mounted = false; };
  }, []);

  if (isLoading) {
    return <section className="nukhab-rankings-section relative grid min-h-52 place-items-center overflow-hidden" aria-label="تحميل الترتيب"><PublicHeroBackground /><span className="relative z-10"><LoadingSpinner /></span></section>;
  }

  const studentVisible = settings?.studentRankingsVisible !== false;
  const familyVisible = settings?.familyRankingsVisible !== false;
  if (!studentVisible && !familyVisible) return null;
  const showPoints = settings?.rankingPointsVisible !== false;

  return (
    <section id="public-rankings" className="nukhab-rankings-section relative min-h-[100svh] scroll-mt-24 overflow-hidden border-y border-white/10 py-10 [font-family:var(--font-ui)] sm:py-14" dir="rtl" aria-label="الترتيب">
      <PublicHeroBackground />
      <div className="relative z-10 space-y-16">
        {familyVisible && <FamilyRankingMarquee items={families} showPoints={showPoints} />}
        {studentVisible && <StudentRankingList items={students} showPoints={showPoints} />}
      </div>
    </section>
  );
};

export default PublicRankingsSection;
