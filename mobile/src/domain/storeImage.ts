export const STORE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
// Product uploads share the existing 1 MiB JSON parser. Reserve space for the
// remaining validated product fields without changing the server's limit.
export const STORE_IMAGE_MAX_UPLOAD_LENGTH = 1024 * 1024 - 4096;
export const STORE_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export class StoreImageError extends Error {
  constructor(readonly kind: 'type' | 'size' | 'content') {
    super(kind === 'size' ? 'حجم الصورة أكبر مما تقبله الخدمة. اختر صورة أصغر.'
      : 'اختر صورة صالحة بصيغة PNG أو JPG أو WebP.');
    this.name = 'StoreImageError';
  }
}

function imageMime(base64: string): string | null {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const bytes: number[] = [];
  let value = 0; let bits = 0;
  for (const character of base64.slice(0, 20)) {
    if (character === '=') break;
    const digit = alphabet.indexOf(character);
    if (digit < 0) return null;
    value = ((value << 6) | digit) & 0xffffff; bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((value >> bits) & 255); }
  }
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if ([82, 73, 70, 70].every((byte, index) => bytes[index] === byte)
    && [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte)) return 'image/webp';
  return null;
}

export function validateStoreImageData(value: unknown, options: { forUpload?: boolean } = {}): string {
  if (value === '') return '';
  if (typeof value !== 'string') throw new StoreImageError('content');
  const data = value.trim();
  if (data.length > Math.ceil(STORE_IMAGE_MAX_BYTES / 3) * 4 + 40
    || (options.forUpload && data.length > STORE_IMAGE_MAX_UPLOAD_LENGTH)) throw new StoreImageError('size');
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match?.[1] || !match[2] || match[2].length % 4) throw new StoreImageError('content');
  const base64 = match[2]; const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  if (base64.length * 3 / 4 - padding > STORE_IMAGE_MAX_BYTES) throw new StoreImageError('size');
  if (imageMime(base64) !== match[1].replace('image/jpg', 'image/jpeg')) throw new StoreImageError('type');
  return data;
}

export function storeImageDataFromBase64(base64: string, mimeType?: string): string {
  const mime = mimeType?.trim().toLowerCase().replace('image/jpg', 'image/jpeg') || imageMime(base64);
  if (!mime || !STORE_IMAGE_MIME_TYPES.some(type => type === mime)) throw new StoreImageError('type');
  return validateStoreImageData(`data:${mime};base64,${base64}`, { forUpload: true });
}
