import { resolveAssetUrl } from '@/lib/assetUrl';

const DEFAULT_PRELOAD_TIMEOUT_MS = 4000;

const preloadImage = (source) => new Promise((resolve) => {
  const url = resolveAssetUrl(source);
  if (!url || typeof Image === 'undefined') {
    resolve();
    return;
  }

  const image = new Image();
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    resolve();
  };
  const finishAfterDecode = () => {
    if (typeof image.decode === 'function') {
      Promise.resolve().then(() => image.decode()).then(finish, finish);
    } else finish();
  };
  image.decoding = 'async';
  image.fetchPriority = 'high';
  image.onload = finishAfterDecode;
  image.onerror = finish;
  image.src = url;
  if (image.complete) finishAfterDecode();
});

export const preloadSiteBrandAssets = (site, { timeoutMs = DEFAULT_PRELOAD_TIMEOUT_MS } = {}) => {
  const assets = [...new Set([
    site?.logo,
    site?.whiteLogo,
    site?.lockupLogo,
    site?.markLogo,
    site?.squareLogo,
  ].filter(Boolean))];

  const loading = Promise.all(assets.map(preloadImage));
  if (!timeoutMs) return loading;
  return Promise.race([
    loading,
    new Promise((resolve) => globalThis.setTimeout(resolve, timeoutMs)),
  ]);
};
