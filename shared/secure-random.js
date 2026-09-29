const UINT32_RANGE = 2 ** 32;

export function secureRandomId(prefix) {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  const id = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${prefix}-${id}`;
}

export function secureRandomInt(maxExclusive) {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > UINT32_RANGE) {
    throw new RangeError('Random range must be an integer between 1 and 2^32');
  }
  const limit = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
  const values = new Uint32Array(1);
  do {
    globalThis.crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % maxExclusive;
}

export function secureRandomItem(items) {
  return items.length ? items[secureRandomInt(items.length)] : undefined;
}
