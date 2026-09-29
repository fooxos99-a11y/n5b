import { isStudentAmountHidden } from '../../shared/student-amount-visibility.js';
import { versionedMushafAsset } from '../../shared/mushaf-package.js';
import { resolveAssetUrl } from '@/lib/assetUrl';

const PAGE_COUNT = 604;
const indexPromise = { current: null };
const pagePromises = new Map();
const resolvedPages = new Map();
const completeMushafPromise = { current: null };

const fetchLocalJson = async (path) => {
  const response = await fetch(resolveAssetUrl(versionedMushafAsset(path)), { cache: 'force-cache' });
  if (!response.ok) throw new Error('تعذر فتح بيانات المصحف المحلية.');
  return response.json();
};

export const clampMushafPage = (page) => Math.max(1, Math.min(PAGE_COUNT, Number(page) || 1));

export const getOfflineMushafIndex = () => {
  if (!indexPromise.current) {
    indexPromise.current = fetchLocalJson('quran/hafs/index.json').catch((error) => {
      indexPromise.current = null;
      throw error;
    });
  }
  return indexPromise.current;
};

export const getOfflineMushafPage = (pageNumber) => {
  const page = clampMushafPage(pageNumber);
  if (!pagePromises.has(page)) {
    pagePromises.set(page, fetchLocalJson(`quran/hafs/pages/${page}.json`)
      .then((data) => {
        resolvedPages.set(page, data);
        return data;
      })
      .catch((error) => {
        pagePromises.delete(page);
        throw error;
      }));
  }
  return pagePromises.get(page);
};

export const getCachedOfflineMushafPage = (pageNumber) => resolvedPages.get(clampMushafPage(pageNumber)) || null;

export const getNearbyMushafPages = (pageNumber, radius = 10) => {
  const page = clampMushafPage(pageNumber);
  return Array.from({ length: (radius * 2) + 1 }, (_, index) => page - radius + index)
    .filter((candidate) => candidate >= 1 && candidate <= PAGE_COUNT);
};

export const preloadOfflineMushafPages = (pageNumber, radius = 10) => {
  return Promise.allSettled(getNearbyMushafPages(pageNumber, radius).map(getOfflineMushafPage));
};

const completeMushafAssets = [
  'quran/hafs/index.json',
  'quran/hafs/fonts/uthmanic-hafs.woff2',
  ...Array.from({ length: PAGE_COUNT }, (_, index) => `quran/hafs/pages/${index + 1}.json`),
  ...Array.from({ length: PAGE_COUNT }, (_, index) => `quran/hafs/fonts/p${index + 1}.woff2`),
];

export const preloadCompleteOfflineMushaf = () => {
  if (completeMushafPromise.current) return completeMushafPromise.current;
  completeMushafPromise.current = (async () => {
    let cursor = 0;
    const preloadAsset = async () => {
      while (cursor < completeMushafAssets.length) {
        const asset = completeMushafAssets[cursor];
        cursor += 1;
        try {
          const response = await fetch(resolveAssetUrl(versionedMushafAsset(asset)), { cache: 'force-cache' });
          if (response.ok) await response.arrayBuffer();
        } catch {
          // A later visit retries individual missing assets through the normal page loader.
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, preloadAsset));
  })();
  return completeMushafPromise.current;
};

export const buildTodayMushafTarget = (todayData) => {
  if (isStudentAmountHidden(todayData, 'memorization')) return null;
  const task = (todayData?.tasks || []).find((item) => item.taskType === 'memorization');
  if (!task) return null;
  const direction = Number(task.fromSurah) > Number(task.toSurah)
    || (Number(task.fromSurah) === Number(task.toSurah) && Number(task.fromAyah) > Number(task.toAyah))
    ? -1
    : 1;
  return {
    page: clampMushafPage(task.fromPage),
    preview: task.ayahPreview || task.preview || 'حفظ اليوم',
    range: {
      fromSurah: Number(task.fromSurah),
      fromAyah: Number(task.fromAyah),
      toSurah: Number(task.toSurah),
      toAyah: Number(task.toAyah),
      direction,
    },
  };
};

export const MUSHAF_PAGE_COUNT = PAGE_COUNT;
