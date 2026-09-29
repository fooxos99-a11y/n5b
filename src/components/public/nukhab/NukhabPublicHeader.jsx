import React from 'react';
import { LogIn, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import { resolveAssetUrl } from '@/lib/assetUrl';

const NukhabPublicHeader = ({
  site,
  hasSession = false,
  onOpenAccount,
}) => (
  <header
    className="fixed inset-x-0 top-0 z-40 border-b border-border/70 bg-background/92 shadow-[0_1px_18px_hsl(var(--foreground)/.06)] backdrop-blur-xl [font-family:var(--font-ui)]"
    dir="rtl"
    data-nukhab-public-header
  >
    <div className="relative mx-auto flex h-16 w-full max-w-7xl items-center gap-3 px-4 sm:h-[4.5rem] sm:px-6 lg:px-8">
      <a href="#nukhab-home" className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="العودة إلى بداية الصفحة">
        <img
          src={resolveAssetUrl(site.markLogo || site.logo)}
          alt={`شعار ${site.name}`}
          className="h-11 w-12 shrink-0 object-contain sm:h-12 sm:w-14"
          decoding="sync"
          fetchpriority="high"
        />
        <span className="hidden min-w-0 border-r border-border pr-3 lg:block">
          <span className="block text-sm font-black leading-5 text-foreground">{site.publicHeaderTitle || site.name}</span>
          {(site.publicHeaderSubtitle ?? site.organizationName) && (
            <span className="block truncate text-[11px] font-bold text-muted-foreground">{site.publicHeaderSubtitle ?? site.organizationName}</span>
          )}
        </span>
      </a>

      <div className="mr-auto flex shrink-0 items-center gap-2">
        <ThemeToggle className="h-11 w-11 rounded-xl text-foreground hover:bg-secondary hover:text-primary" />
        <Button type="button" onClick={onOpenAccount} className="h-11 min-h-11 gap-1.5 rounded-full border-0 bg-primary px-3.5 text-xs font-bold shadow-none hover:bg-primary-dark hover:shadow-none">
          {hasSession ? <User className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
          {hasSession ? 'حسابي' : 'تسجيل الدخول'}
        </Button>
      </div>
    </div>
  </header>
);

export default NukhabPublicHeader;
