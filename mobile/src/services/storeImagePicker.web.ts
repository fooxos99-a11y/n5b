import { STORE_IMAGE_MAX_BYTES, STORE_IMAGE_MIME_TYPES, StoreImageError, validateStoreImageData } from '../domain/storeImage';

export function pickStoreImage(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = STORE_IMAGE_MIME_TYPES.join(','); input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false; let reading = false;
    const finish = (result: string | null, error?: Error) => {
      if (settled) return;
      settled = true; input.remove(); window.removeEventListener('focus', onFocus);
      if (error) reject(error); else resolve(result);
    };
    const onFocus = () => { window.setTimeout(() => { if (!reading && !input.files?.length) finish(null); }, 300); };
    window.addEventListener('focus', onFocus);
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { finish(null); return; }
      reading = true;
      if (!STORE_IMAGE_MIME_TYPES.some(type => type === file.type)) { finish(null, new StoreImageError('type')); return; }
      if (file.size > STORE_IMAGE_MAX_BYTES) { finish(null, new StoreImageError('size')); return; }
      const reader = new FileReader();
      reader.onerror = () => finish(null, new Error('تعذّر قراءة الصورة المختارة.'));
      reader.onload = () => {
        try { finish(validateStoreImageData(reader.result, { forUpload: true })); }
        catch (cause) { finish(null, cause instanceof Error ? cause : new StoreImageError('content')); }
      };
      reader.readAsDataURL(file);
    }, { once: true });
    try { input.click(); }
    catch { finish(null, new Error('تعذّر فتح اختيار الصورة.')); }
  });
}
