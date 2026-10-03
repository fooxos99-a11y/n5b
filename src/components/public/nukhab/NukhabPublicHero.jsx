import React from 'react';
import { resolveAssetUrl } from '@/lib/assetUrl';

const NukhabPublicHero = ({
  site,
}) => (
  <section id="nukhab-home" className="relative grid min-h-[82svh] place-items-center overflow-hidden border-b border-border bg-background px-4 pb-16 pt-28 [font-family:var(--font-ui)] sm:min-h-[88svh] sm:px-6 sm:pb-20 sm:pt-32 lg:px-8" dir="rtl">
      <div className="pointer-events-none absolute inset-0 opacity-70 dark:opacity-45" aria-hidden="true">
        <div className="absolute -right-32 top-10 h-80 w-80 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/.14),transparent_70%)]" />
        <div className="absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,hsl(var(--accent)/.18),transparent_70%)]" />
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.08] dark:opacity-[0.12]" />
      </div>

      <div className="nukhab-hero-enter relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/.12),transparent_70%)]" aria-hidden="true" />
        {site.showPublicHeroLogo !== false && (
          <div className="relative flex min-h-60 w-full items-center justify-center px-6 sm:min-h-72">
            <img
              src={resolveAssetUrl(site.logo)}
              srcSet={site.logoSmall
                ? `${resolveAssetUrl(site.logoSmall)} 320w, ${resolveAssetUrl(site.logo)} 640w`
                : undefined}
              sizes="min(72vw, 320px)"
              alt={`هوية ${site.name}`}
              className="h-auto w-[min(72vw,20rem)] object-contain"
              width="640"
              height="640"
              decoding="async"
              fetchPriority="high"
            />
          </div>
        )}
        {site.organizationName && (
          <h1 className={`relative font-black tracking-wide text-foreground ${site.showPublicHeroLogo === false ? 'text-4xl sm:text-5xl' : 'mt-2 text-2xl sm:text-3xl'}`}>
            {site.organizationName}
          </h1>
        )}
      </div>
    </section>
);

export default NukhabPublicHero;
