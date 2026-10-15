import { resolveAssetUrl } from '@/lib/assetUrl';
import { getOfflineMushafDisplay } from '@/services/offlineMushaf';

const mushafFontPromises = new Map();

const loadFont = (family, url) => {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve();
  if (mushafFontPromises.has(family)) return mushafFontPromises.get(family);

  const fontFace = new FontFace(family, `url("${url}") format("woff2")`);
  const promise = fontFace.load()
    .then((loadedFont) => {
      document.fonts.add(loadedFont);
      return loadedFont;
    })
    .catch((error) => {
      mushafFontPromises.delete(family);
      throw error;
    });
  mushafFontPromises.set(family, promise);
  return promise;
};

export const preloadMushafFonts = async (pageNumbers = []) => {
  const pages = [...new Set(pageNumbers.map(Number).filter((page) => page > 0))];
  const displayLayouts = await Promise.allSettled(pages.map(getOfflineMushafDisplay));
  const v1Pages = [...new Set(displayLayouts.flatMap((result) => result.status === 'fulfilled'
    ? Object.values(result.value.words).map((word) => Number(word.pageV1)).filter((page) => page >= 1 && page <= 604)
    : []))];
  const results = await Promise.allSettled([
    loadFont('Uthmanic-Hafs', resolveAssetUrl('quran/hafs/fonts/uthmanic-hafs.woff2')),
    ...pages.map((page) => loadFont(`QCF-P${page}`, resolveAssetUrl(`quran/hafs/fonts/p${page}.woff2`))),
    ...v1Pages.map((page) => loadFont(`QCF-V1-P${page}`, resolveAssetUrl(`quran/hafs/fonts/v1/p${page}.woff2`))),
  ]);
  return displayLayouts.every((result) => result.status === 'fulfilled') && results.every((result) => result.status === 'fulfilled');
};
