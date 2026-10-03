import React from 'react';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import PublicHeroBackground from '@/components/public/PublicHeroBackground';
import { resolveAssetUrl } from '@/lib/assetUrl';

const PublicHeroSection = ({ site }) => (
  <section
    className="relative grid min-h-[100svh] place-items-center overflow-hidden [font-family:var(--font-ui)]"
    aria-label={site.name}
  >
    <PublicHeroBackground />
    <div className="relative z-10 flex w-full flex-col items-center justify-center px-6 pb-24 pt-28 text-center sm:pb-28 sm:pt-32">
        <img
          src={resolveAssetUrl(site.whiteLogo || site.lockupLogo || site.logo)}
          alt={`شعار ${site.name}`}
          decoding="sync"
          fetchPriority="high"
          className="h-auto w-[min(58vw,14.5rem)] object-contain drop-shadow-[0_0_30px_rgba(255,255,255,.2)] sm:w-[min(38vw,19rem)] lg:w-[21rem]"
        />
      {site.organizationName && (
        <motion.p
          className="mt-4 text-xl font-black tracking-wide text-white drop-shadow-[0_2px_12px_rgba(0,0,0,.35)] sm:text-2xl lg:text-3xl"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35 }}
        >
          {site.organizationName}
        </motion.p>
      )}
    </div>
    <div className="absolute bottom-7 left-1/2 z-20 -translate-x-1/2 sm:bottom-9">
      <motion.a
        href="#public-rankings"
        aria-label="الانتقال إلى أفضل الحلقات والطلاب"
        className="flex min-h-12 min-w-12 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-[var(--brand-navigation-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-navigation-accent)]"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ChevronDown className="h-8 w-8" strokeWidth={1.8} />
      </motion.a>
    </div>
  </section>
);

export default PublicHeroSection;
