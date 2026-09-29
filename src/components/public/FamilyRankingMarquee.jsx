import React, { useMemo } from 'react';
import { Crown, Diamond, Flame, Medal, Sparkles, Star, Swords, Trophy, Users, Zap } from 'lucide-react';
import { formatPointsNumber } from '@/lib/pointsFormat';

const rankIcons = [Crown, Diamond, Swords, Trophy, Zap, Medal, Flame, Sparkles];
const rankLabels = ['', 'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر'];

const formatNumber = (value) => Number(value || 0).toLocaleString('ar-SA-u-nu-latn');
const formatRank = (rank) => rankLabels[rank] || `المركز ${formatNumber(rank)}`;

const rankStyle = (rank) => {
  if (rank === 1) return { color: '#ffd86b', border: 'border-[#ffd86b]/45', glow: 'shadow-[#ffd86b]/20' };
  if (rank === 2) return { color: '#afc8ff', border: 'border-[#afc8ff]/45', glow: 'shadow-[#afc8ff]/20' };
  if (rank === 3) return { color: '#ff9d5c', border: 'border-[#ff9d5c]/45', glow: 'shadow-[#ff9d5c]/20' };
  return { color: 'var(--brand-navigation-accent)', border: 'border-white/15', glow: 'shadow-black/15' };
};

const FamilyRankingCard = ({ item, index, showPoints }) => {
  const style = rankStyle(item.rank);
  const Icon = rankIcons[(item.rank + Number(item.id || index) - 1) % rankIcons.length];

  return (
    <article className="nukhab-family-card mx-3 flex min-h-24 w-[min(90vw,28rem)] flex-shrink-0 items-stretch overflow-hidden rounded-2xl border border-white/15 bg-[color-mix(in_srgb,var(--brand-navigation-highlight)_12%,var(--brand-navigation))] text-right shadow-lg shadow-black/25 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-[var(--brand-navigation-accent)] sm:w-[28rem]" dir="rtl">
      <span className="w-1.5 shrink-0" style={{ backgroundColor: style.color }} />
      <span className={`m-3 flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border bg-[var(--brand-navigation)]/90 shadow-lg ${style.border} ${style.glow}`}>
        <Icon className="h-7 w-7" strokeWidth={2} style={{ color: style.color }} />
      </span>
      <span className="min-w-0 flex flex-1 items-center justify-between gap-3 py-3 pl-4">
        <span className="min-w-0">
          <span className="text-xs font-bold" style={{ color: style.color }}>{formatRank(item.rank)}</span>
          <span className="mt-1 block whitespace-normal break-words text-xl font-black leading-snug text-white">{item.name}</span>
        </span>
        {showPoints && (
          <span className="inline-flex shrink-0 items-center gap-1 border-r border-white/15 pr-3 text-lg font-black text-[var(--brand-navigation-accent)]">
            <Star className="h-5 w-5" />
            {formatPointsNumber(item.points)}
          </span>
        )}
      </span>
    </article>
  );
};

const FamilyRankingMarquee = ({ items, showPoints }) => {
  const baseItems = useMemo(() => {
    if (!items.length) return [];
    const repetitions = Math.max(1, Math.ceil(8 / items.length));
    return Array.from({ length: items.length * repetitions }, (_, index) => items[index % items.length]);
  }, [items]);

  return (
    <div className="space-y-5">
      <h2 className="nukhab-ranking-title flex items-center justify-center gap-3 px-5 text-center text-3xl font-black text-[var(--brand-navigation-accent)]">
        <Users className="h-8 w-8" />
        أفضل الحلقات
      </h2>
      <div className="nukhab-ranking-fade relative w-full overflow-hidden" dir="ltr">
        {baseItems.length ? (
          <div className="flex w-max animate-nukhab-family-marquee" data-family-marquee="right-to-left">
            {[false, true].map((duplicate) => (
              <div key={String(duplicate)} className="flex shrink-0" aria-hidden={duplicate || undefined}>
                {baseItems.map((item, index) => (
                  <FamilyRankingCard
                    key={`${duplicate ? 'duplicate' : 'primary'}-${item.id}-${index}`}
                    item={item}
                    index={index}
                    showPoints={showPoints}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-auto flex min-h-24 w-[min(90vw,28rem)] items-center justify-center rounded-2xl border border-white/15 bg-[color-mix(in_srgb,var(--brand-navigation-highlight)_12%,var(--brand-navigation))] px-5 text-center text-sm font-bold text-white/60">
            لا توجد بيانات ترتيب للحلقات حاليًا.
          </div>
        )}
      </div>
    </div>
  );
};

export default FamilyRankingMarquee;
