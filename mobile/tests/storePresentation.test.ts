import assert from 'node:assert/strict';
import test from 'node:test';
import { sameStoreProduct, storePurchaseAvailability } from '../src/components/store/storePresentation';
import type { StoreProduct } from '../src/domain/storeManagement';

const product: StoreProduct = { id: 1, name: 'هدية', imageData: '', pointsPrice: 5, stock: null, isActive: true };
test('unknown store balance never becomes a zero balance or purchase permission', () => {
  assert.equal(storePurchaseAvailability(product, null), 'unknown-balance');
  assert.equal(storePurchaseAvailability(product, 0), 'insufficient');
});
test('fractional balance and exact product price retain eligibility boundaries', () => {
  assert.equal(storePurchaseAvailability(product, 4.75), 'insufficient');
  assert.equal(storePurchaseAvailability(product, 5), 'available');
  assert.equal(storePurchaseAvailability(product, 5.5), 'available');
});
test('inactive and exhausted stock cannot be purchased even with sufficient balance', () => {
  assert.equal(storePurchaseAvailability({ ...product, isActive: false }, 10), 'unavailable');
  assert.equal(storePurchaseAvailability({ ...product, stock: 0 }, 10), 'unavailable');
  assert.equal(storePurchaseAvailability({ ...product, stock: 1 }, 10), 'available');
});
test('purchase confirmation detects changes in identity, price, stock, image, and visibility', () => {
  assert.equal(sameStoreProduct(undefined, product), false);
  assert.equal(sameStoreProduct({ ...product }, product), true);
  for (const changed of [{ ...product, id: 2 }, { ...product, pointsPrice: 6 }, { ...product, stock: 1 },
    { ...product, imageData: 'changed' }, { ...product, isActive: false }]) assert.equal(sameStoreProduct(changed, product), false);
});
