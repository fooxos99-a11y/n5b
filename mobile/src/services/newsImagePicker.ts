import { File } from 'expo-file-system';
import { validateNewsImage } from '../domain/newsManagement';
import { STORE_IMAGE_MIME_TYPES } from '../domain/storeImage';

export async function pickNewsImage(): Promise<string | null> {
  try {
    const selection = await File.pickFileAsync({ mimeTypes: [...STORE_IMAGE_MIME_TYPES], multipleFiles: false });
    if (selection.canceled) return null;
    const file = selection.result;
    if (!file.exists) throw new Error('تعذّرت قراءة الصورة.');
    if (file.size > 5 * 1024 * 1024) throw new Error('اختر صورة بحجم أقصاه ٥ ميجابايت.');
    const mime = file.type.trim().toLowerCase();
    if (!STORE_IMAGE_MIME_TYPES.some(type => type === mime)) throw new Error('اختر صورة PNG أو JPEG أو WebP.');
    return validateNewsImage(`data:${mime};base64,${await file.base64()}`);
  } catch (cause) { throw new Error(cause instanceof Error ? cause.message : 'تعذّرت قراءة الصورة المختارة.', { cause }); }
}
