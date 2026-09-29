import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { createStoreImageOptimizer, encodeStoreImage, optimizeStoreProducts } from '../server/services/storeImages.js';

/** Wrap a generated fixture exactly as the current store upload contract expects. */
const dataUrl = (buffer, type = 'png') => `data:image/${type};base64,${buffer.toString('base64')}`;

test('display copies shrink large images without cropping or losing transparency', async () => {
  const original = await sharp({ create: { width: 1800, height: 1200, channels: 4, background: { r: 30, g: 120, b: 190, alpha: 0.5 } } })
    .png({ compressionLevel: 0 }).toBuffer();
  const source = dataUrl(original);
  const result = await encodeStoreImage(source);
  assert.ok(result.startsWith('data:image/webp;base64,'));
  assert.ok(result.length < source.length / 10);
  const metadata = await sharp(Buffer.from(result.split(',')[1], 'base64')).metadata();
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 800);
  assert.equal(metadata.hasAlpha, true);
  assert.equal(source, dataUrl(original));
});

test('small images are not enlarged and invalid legacy images remain unchanged', async () => {
  const source = dataUrl(await sharp({ create: { width: 32, height: 16, channels: 3, background: 'red' } }).png().toBuffer());
  const result = await encodeStoreImage(source);
  assert.ok(result.length <= source.length);
  const metadata = await sharp(Buffer.from(result.split(',')[1], 'base64')).metadata();
  assert.equal(metadata.width, 32);
  assert.equal(metadata.height, 16);
  assert.equal(await encodeStoreImage('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(await encodeStoreImage('https://example.invalid/image.png'), 'https://example.invalid/image.png');
});

test('200 simultaneous requests share one conversion and changed content invalidates it', async () => {
  let conversions = 0;
  const optimize = createStoreImageOptimizer(async (source) => {
    conversions += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return `${source}:optimized`;
  });
  const results = await Promise.all(Array.from({ length: 200 }, () => optimize('original')));
  assert.equal(conversions, 1);
  assert.ok(results.every((value) => value === 'original:optimized'));
  assert.equal(await optimize('original'), 'original:optimized');
  assert.equal(conversions, 1);
  await optimize('changed');
  assert.equal(conversions, 2);
});

test('conversions are limited to two and recover after encoder failure', async () => {
  let active = 0;
  let peak = 0;
  const optimize = createStoreImageOptimizer(async (source) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    if (source === 'bad') throw new Error('invalid image');
    return source;
  });
  const results = await Promise.all(['bad', 'a', 'b', 'c', 'd'].map(optimize));
  assert.deepEqual(results, ['bad', 'a', 'b', 'c', 'd']);
  assert.equal(peak, 2);
  assert.equal(await optimize('after'), 'after');
});

test('catalog optimization does not mutate original images or product state', async () => {
  const products = [{ id: 1, imageData: 'legacy', stock: 3, pointsPrice: 10 }];
  assert.deepEqual(await optimizeStoreProducts(products), products);
  assert.equal(products[0].imageData, 'legacy');
});
