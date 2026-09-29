import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProductPayload } from '../server/routes/storeRoutes.js';

test('store product images are optional on create and retained on an unrelated edit', () => {
  const product = normalizeProductPayload({ name: 'منتج تجريبي', pointsPrice: 5 });
  assert.equal(product.imageData, '');
  const imageData = 'data:image/png;base64,YQ==';
  assert.equal(normalizeProductPayload({ name: 'تعديل' }, { ...product, imageData }).imageData, imageData);
  assert.equal(normalizeProductPayload({ imageData: '' }, { ...product, imageData }).imageData, '');
  assert.throws(() => normalizeProductPayload({ ...product, imageData: 'bad-image' }), { statusCode: 422 });
});
