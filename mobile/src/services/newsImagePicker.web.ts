import { validateNewsImage } from '../domain/newsManagement';
import { STORE_IMAGE_MIME_TYPES } from '../domain/storeImage';

export function pickNewsImage(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = STORE_IMAGE_MIME_TYPES.join(','); input.style.display = 'none';
    document.body.appendChild(input); let settled = false, reading = false;
    const finish = (value: string | null, error?: unknown) => {
      if (settled) return; settled = true; input.remove(); window.removeEventListener('focus', focus);
      if (error) reject(error); else resolve(value);
    };
    const focus = () => { window.setTimeout(() => { if (!reading && !input.files?.length) finish(null); }, 300); };
    window.addEventListener('focus', focus);
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0]; if (!file) { finish(null); return; } reading = true;
      if (!STORE_IMAGE_MIME_TYPES.some(type => type === file.type) || file.size > 5 * 1024 * 1024) {
        finish(null, new Error('اختر صورة PNG أو JPEG أو WebP بحجم أقصاه ٥ ميجابايت.')); return;
      }
      const reader = new FileReader(); reader.onerror = () => finish(null, new Error('تعذّرت قراءة الصورة.'));
      reader.onload = () => { try { finish(validateNewsImage(reader.result)); } catch (cause) { finish(null, cause); } };
      reader.readAsDataURL(file);
    }, { once: true });
    try { input.click(); } catch (cause) { finish(null, cause); }
  });
}
