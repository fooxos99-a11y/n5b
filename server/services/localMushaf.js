import fs from 'node:fs/promises';

const pageCache = new Map();
const fontCache = new Map();

const pageUrl = (page) => new URL(`../../public/quran/hafs/pages/${page}.json`, import.meta.url);

export const readLocalMushafPage = (pageNumber) => {
  const page = Number(pageNumber || 0);
  if (!Number.isInteger(page) || page < 1 || page > 604) return Promise.resolve(null);
  if (!pageCache.has(page)) {
    pageCache.set(page, fs.readFile(pageUrl(page), 'utf8')
      .then((content) => JSON.parse(content))
      .then((payload) => {
        if (Number(payload?.page) !== page || !Array.isArray(payload?.words)) {
          throw new Error(`Invalid packaged Mushaf page ${page}`);
        }
        return payload;
      })
      .catch((error) => {
        pageCache.delete(page);
        throw error;
      }));
  }
  return pageCache.get(page);
};

export const readLocalMushafFont = (fileName) => {
  const safeName = String(fileName || '');
  if (!/^(?:p(?:[1-9]|[1-5]\d{1,2}|60[0-4])|uthmanic-hafs)\.woff2$/.test(safeName)) {
    return Promise.resolve(null);
  }
  if (!fontCache.has(safeName)) {
    fontCache.set(safeName, fs.readFile(new URL(`../../public/quran/hafs/fonts/${safeName}`, import.meta.url))
      .catch((error) => {
        fontCache.delete(safeName);
        throw error;
      }));
  }
  return fontCache.get(safeName);
};
