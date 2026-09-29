import { createHash } from 'node:crypto';
import sharp from 'sharp';

const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const MAX_CACHE_BYTES = 24 * 1024 * 1024;
const MAX_PENDING = 8;

/** Generate a display copy, keeping aspect ratio, transparency and the original on any failure. */
export async function encodeStoreImage(source) {
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source);
  if (!match) return source;
  const input = Buffer.from(match[2], 'base64');
  if (input.length > MAX_INPUT_BYTES) return source;
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: 'warning' });
    const metadata = await image.metadata();
    // Preserve animated images rather than silently discarding frames.
    if ((metadata.pages || 1) > 1) return source;
    const output = await image.rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100, effort: 4 })
      .timeout({ seconds: 5 })
      .toBuffer();
    const optimized = `data:image/webp;base64,${output.toString('base64')}`;
    return optimized.length < source.length ? optimized : source;
  } catch {
    // Legacy or unsupported files remain viewable; optimization must not break the catalog.
    return source;
  }
}

/** Share concurrent work and bound both CPU concurrency and retained display-copy memory. */
export function createStoreImageOptimizer(encode = encodeStoreImage) {
  const cache = new Map();
  const pending = new Map();
  const waiting = [];
  let active = 0;
  let cacheBytes = 0;

  /** Retain only display copies, using LRU eviction and a fixed memory budget. */
  function remember(key, value) {
    const bytes = value.length * 2;
    if (bytes > MAX_CACHE_BYTES) return;
    while (cache.size >= 200 || cacheBytes + bytes > MAX_CACHE_BYTES) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).length * 2;
      cache.delete(oldest);
    }
    cache.set(key, value);
    cacheBytes += bytes;
  }

  /** Process at most two images at once, releasing the next waiter even after failure. */
  async function convert(key, source) {
    if (active >= 2) await new Promise((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      const result = await encode(source);
      remember(key, result);
      return result;
    } catch {
      return source;
    } finally {
      pending.delete(key);
      if (waiting.length) waiting.shift()();
      else active -= 1;
    }
  }

  /** Content hashes invalidate changed images without caching catalog prices, stock or student balances. */
  return function optimizeStoreImage(source) {
    if (typeof source !== 'string' || source.length > Math.ceil(MAX_INPUT_BYTES * 4 / 3) + 40) return Promise.resolve(source);
    const key = createHash('sha256').update(source).digest('hex');
    if (cache.has(key)) {
      const value = cache.get(key);
      cache.delete(key);
      cache.set(key, value);
      return Promise.resolve(value);
    }
    if (pending.has(key)) return pending.get(key);
    // A cold catalog must not create an unbounded queue during peak traffic.
    if (pending.size >= MAX_PENDING) return Promise.resolve(source);
    const operation = convert(key, source);
    pending.set(key, operation);
    return operation;
  };
}

export const optimizeStoreImage = createStoreImageOptimizer();

/** Send optimized display copies while leaving original database images untouched. */
export async function optimizeStoreProducts(products) {
  const result = [];
  for (const product of products) {
    result.push({ ...product, imageData: await optimizeStoreImage(product.imageData) });
  }
  return result;
}
