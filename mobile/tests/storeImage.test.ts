import assert from 'node:assert/strict';
import test from 'node:test';
import { STORE_IMAGE_MAX_UPLOAD_LENGTH, StoreImageError, storeImageDataFromBase64, validateStoreImageData } from '../src/domain/storeImage';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
test('optional image remains empty; PNG is decoded from its actual bytes with or without MIME', () => {
  assert.equal(validateStoreImageData(''), '');
  assert.equal(storeImageDataFromBase64(png), `data:image/png;base64,${png}`);
  assert.equal(storeImageDataFromBase64(png, 'image/png'), `data:image/png;base64,${png}`);
});
test('image MIME must match its signature; active content and malformed Base64 are rejected', () => {
  for (const value of ['https://example.invalid/image.png', 'data:text/html;base64,PHNjcmlwdD4=',
    'data:image/png;base64,AQ==', `data:image/jpeg;base64,${png}`, 'data:image/png;base64,iVBOR=w0KGgoA', null]) {
    assert.throws(() => validateStoreImageData(value), StoreImageError);
  }
  assert.throws(() => storeImageDataFromBase64(png, 'image/svg+xml'), StoreImageError);
});
test('new image fits the actual JSON transport limit without rejecting a larger stored display on read', () => {
  const data = `data:image/png;base64,${png.slice(0, -1)}${'A'.repeat(STORE_IMAGE_MAX_UPLOAD_LENGTH)}`;
  assert.throws(() => validateStoreImageData(data, { forUpload: true }), error => error instanceof StoreImageError && error.kind === 'size');
  const larger = `data:image/png;base64,iVBORw0KGgoA${'A'.repeat(1024 * 1024)}`;
  assert.equal(validateStoreImageData(larger), larger);
  assert.throws(() => validateStoreImageData(`data:image/png;base64,${'A'.repeat(15 * 1024 * 1024)}`), StoreImageError);
});
