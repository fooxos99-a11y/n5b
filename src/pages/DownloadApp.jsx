import React, { useEffect, useMemo } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveAssetUrl } from '@/lib/assetUrl';
import {
  detectDownloadPlatform,
  getDownloadPlatformLinks,
} from '@/lib/downloadPlatform';
import { useSiteConfig } from '@/site/SiteProvider';

const DownloadApp = () => {
  const site = useSiteConfig();
  const downloadLinks = useMemo(() => getDownloadPlatformLinks(site), [site]);
  const appLogo = resolveAssetUrl(site.squareLogo || site.markLogo || site.logo);
  const platform = useMemo(() => detectDownloadPlatform(
    navigator.userAgent,
    navigator.maxTouchPoints,
  ), []);

  useEffect(() => {
    if (platform === 'android' && downloadLinks.android) window.location.replace(downloadLinks.android);
    if (platform === 'ios' && downloadLinks.ios) window.location.replace(downloadLinks.ios);
  }, [downloadLinks, platform]);

  return (
    <main className="grid min-h-dvh w-full place-items-center overflow-x-hidden bg-[radial-gradient(circle_at_top,#0d6377_0,#04394d_42%,#022b3b_100%)] p-5 [font-family:var(--font-ui)]" dir="rtl">
      <section className="w-full max-w-md rounded-[2rem] border border-white/20 bg-white/95 p-6 text-center shadow-2xl backdrop-blur sm:p-8">
        <img src={appLogo} alt={`شعار ${site.name}`} width="96" height="96" className="mx-auto block h-24 w-24 object-contain" decoding="sync" />
        <h1 className="mt-4 text-2xl font-black text-[#06504a]">تحميل تطبيق {site.name}</h1>
        <div className="mt-6 grid gap-3">
          <Button asChild className="min-h-12 gap-2 rounded-xl bg-[#076c64] text-base hover:bg-[#06534d]">
            <a href={downloadLinks.android} download><Download className="h-5 w-5" aria-hidden="true" /><span className="inline-flex flex-wrap items-center justify-center gap-x-1"><span>تحميل نسخة</span><bdi dir="ltr" className="inline-block shrink-0">Android</bdi></span></a>
          </Button>
          {downloadLinks.ios && (
            <Button asChild variant="outline" className="min-h-12 gap-2 rounded-xl border-[#076c64]/25 bg-white text-base text-[#06504a] hover:bg-[#e8f2f5] hover:text-[#06504a]">
              <a href={downloadLinks.ios}><Smartphone className="h-5 w-5" aria-hidden="true" /><span className="inline-flex flex-wrap items-center justify-center gap-x-1"><span>تحميل نسخة</span><bdi dir="ltr" className="inline-block shrink-0">App Store</bdi></span></a>
            </Button>
          )}
        </div>
      </section>
    </main>
  );
};

export default DownloadApp;
