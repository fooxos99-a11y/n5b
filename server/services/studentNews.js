import sharp from 'sharp';
import { DEFAULT_NEWS_TEXT_COLOR } from '../../shared/student-news.js';
const invalid = message => Object.assign(new Error(message), { statusCode: 422 });
export function removeDeletedNewsCommittees(content, committeeIds) {
  const existing = new Set(committeeIds.map(Number));
  return { ...content, entries: content.entries.map(entry => {
    if (!entry.committeeIds.length) return entry;
    const retained = entry.committeeIds.filter(id => existing.has(id));
    // An empty audience normally means everyone; never broaden a deleted audience.
    return { ...entry, committeeIds: retained, enabled: retained.length ? entry.enabled : false };
  }) };
}
function validTime(value) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}Z`))
    && new Date(`${value}Z`).toISOString().slice(0, 16) === value;
}
async function normalizeImage(source, savedImages) {
  if (source === '' || source === undefined || source === null) return '';
  if (typeof source !== 'string' || source.length > 7_000_000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(source)) throw invalid('اختر صورة PNG أو JPEG أو WebP بحجم أقصاه ٥ ميجابايت.');
  if (savedImages.includes(source)) return source;
  try {
    const buffer = await sharp(Buffer.from(source.split(',')[1], 'base64'), { limitInputPixels: 40_000_000 })
      .rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 88 }).timeout({ seconds: 5 }).toBuffer();
    return `data:image/webp;base64,${buffer.toString('base64')}`;
  } catch { throw invalid('الصورة غير قابلة للقراءة. اختر صورة أخرى.'); }
}
async function normalizeEntry(entry, saved) {
  const title = String(entry.title || '').trim();
  if (!title || title.length > 80) throw invalid('اكتب الخبر بحد أقصى ٨٠ حرفًا.');
  if (entry.body != null && typeof entry.body !== 'string') throw invalid('نص الخبر غير صالح.');
  const body = (entry.body || '').trim();
  const textColor = entry.textColor ?? DEFAULT_NEWS_TEXT_COLOR;
  if (typeof textColor !== 'string' || !/^#[\da-f]{6}$/i.test(textColor)) throw invalid('اختر لونًا صالحًا لنص الخبر.');
  if (body.length > 2000) throw invalid('نص الخبر يجب ألا يتجاوز ٢٠٠٠ حرف.');
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(entry.id || '')) throw invalid('معرّف الخبر غير صالح.');
  if (!Array.isArray(entry.committeeIds) || entry.committeeIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw invalid('الحلقات غير صالحة.');
  const boundary = (value, time) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value + time : String(value || '');
  const startsAt = boundary(entry.startsAt, 'T00:00'), endsAt = boundary(entry.endsAt, 'T23:59');
  if (!validTime(startsAt) || !validTime(endsAt) || (startsAt && endsAt && startsAt > endsAt)) throw invalid('وقت نهاية الخبر يجب أن يكون بعد بدايته.');
  const result = { id: entry.id, title, body, textColor, startsAt, endsAt, committeeIds: [...new Set(entry.committeeIds)], enabled: entry.enabled !== false,
    image: await normalizeImage(entry.image, saved.map(item => item.image)) };
  const previous = saved.find(item => item.id === entry.id);
  if (previous?.legacyStudentIds?.length && entry.legacyStudentIds !== undefined) result.legacyStudentIds = previous.legacyStudentIds;
  return result;
}
export async function normalizeStudentNews(body, saved = []) {
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) throw invalid('أعد تحميل الأخبار قبل الحفظ.');
  if (!Array.isArray(body.entries) || body.entries.length > 8 || new Set(body.entries.map(entry => entry?.id)).size !== body.entries.length) throw invalid('الحد الأقصى ٨ أخبار مستقلة.');
  const entries = [];
  for (const entry of body.entries) entries.push(await normalizeEntry(entry || {}, saved));
  if (JSON.stringify(entries).length > 5_000_000) throw invalid('حجم الصور الإجمالي كبير؛ قلل أحجامها.');
  return { entries };
}
