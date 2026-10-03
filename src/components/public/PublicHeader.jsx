import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveAssetUrl } from '@/lib/assetUrl';

const PublicHeader = ({ site, hasSession = false, onOpenAccount }) => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const logoSource = resolveAssetUrl(
    isScrolled
      ? site.markLogo || site.logo
      : site.whiteLogo || site.markLogo || site.logo,
  );

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 border-b transition-[background-color,border-color,box-shadow] duration-300 [font-family:var(--font-ui)] ${
        isScrolled
          ? 'border-primary/10 bg-white shadow-[0_4px_20px_rgba(5,46,65,0.10)]'
          : 'border-transparent bg-transparent'
      }`}
      dir="rtl"
      data-public-header={isScrolled ? 'solid' : 'overlay'}
    >
      <div className="mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-4 sm:h-24 sm:px-7 lg:px-10">
        <div className="flex items-center" aria-label={site.name}>
          <img
            src={logoSource}
            alt={`شعار ${site.name}`}
            decoding="sync"
            fetchPriority="high"
            className="h-[4.25rem] w-[4.6rem] object-contain sm:h-[5rem] sm:w-[5.4rem]"
          />
        </div>

        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onOpenAccount}
            className={`relative z-10 h-11 w-11 touch-manipulation transition-colors duration-300 ${
              isScrolled
                ? 'text-primary hover:bg-primary/5 hover:text-[var(--brand-navigation-highlight)]'
                : 'text-white hover:bg-white/10 hover:text-[var(--brand-navigation-accent)]'
            }`}
            title={hasSession ? 'فتح الحساب' : 'الحساب'}
            aria-label={hasSession ? 'فتح الحساب' : 'فتح تسجيل الدخول'}
          >
            <User className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </header>
  );
};

export default PublicHeader;
