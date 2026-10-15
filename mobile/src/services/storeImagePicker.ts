import { File } from 'expo-file-system';
import { STORE_IMAGE_MAX_BYTES, STORE_IMAGE_MIME_TYPES, StoreImageError, storeImageDataFromBase64 } from '../domain/storeImage';

export async function pickStoreImage(): Promise<string | null> {
  try {
    const selection = await File.pickFileAsync({ mimeTypes: [...STORE_IMAGE_MIME_TYPES], multipleFiles: false });
    if (selection.canceled) return null;
    const file = selection.result;
    if (!file.exists) throw new StoreImageError('content');
    if (file.size > STORE_IMAGE_MAX_BYTES) throw new StoreImageError('size');
    return storeImageDataFromBase64(await file.base64(), file.type);
  } catch (cause) {
    if (cause instanceof StoreImageError) throw cause;
    throw new Error('تعذّر قراءة الصورة المختارة.', { cause });
  }
}
