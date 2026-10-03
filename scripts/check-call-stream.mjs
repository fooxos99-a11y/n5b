import process from 'node:process';
import { pathToFileURL } from 'node:url';

class CallStreamCheckError extends Error {}
const fail = message => { throw new CallStreamCheckError(message); };

/** Read-only probe. Credentials stay in environment variables and are never logged. */
export async function checkCallStream({ url, headers, timeoutMs = 12000, frameTimeoutMs = 5000 }) {
  let target;
  try { target = new URL(url); } catch { fail('عنوان SSE غير صحيح.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
  if ((!['https:', ...(local ? ['http:'] : [])].includes(target.protocol))
    || target.username || target.password || target.search || target.hash
    || !target.pathname.endsWith('/calls/events')) fail('يلزم رابط HTTPS الفعلي لمسار calls/events دون بيانات دخول في الرابط.');
  if (!headers?.Authorization && !headers?.Cookie) fail('يلزم حساب مصرح له عبر متغيرات البيئة.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let reader, frameTimer;
  try {
    const anonymous = await fetch(target, {
      redirect: 'error', signal: controller.signal,
      headers: { Accept: 'text/event-stream', 'X-Registration-Number': headers['X-Registration-Number'] || '' },
    });
    await anonymous.body?.cancel();
    if (![401, 403].includes(anonymous.status)) fail('لم يُرفض الاتصال دون جلسة؛ تحقق من المسار والمصادقة.');
    const requestedAt = Date.now();
    frameTimer = setTimeout(() => controller.abort(), frameTimeoutMs);
    const response = await fetch(target, { headers: { ...headers, Accept: 'text/event-stream' }, redirect: 'error', signal: controller.signal });
    clearTimeout(frameTimer);
    if (response.status !== 200 || !response.body) fail(`لم يبدأ SSE بالحساب المصرح له (HTTP ${response.status}).`);
    if (!response.headers.get('content-type')?.startsWith('text/event-stream')) fail('نوع الاستجابة ليس text/event-stream.');
    const directives = (response.headers.get('cache-control') || '').split(',').map(value => value.trim().toLowerCase());
    if (!['private', 'no-store', 'no-transform'].every(value => directives.includes(value))) fail('ترويسات منع تخزين SSE أو تحويله ناقصة.');
    if (response.headers.get('content-encoding') && response.headers.get('content-encoding') !== 'identity') fail('مسار SSE ما زال مضغوطاً.');
    if (['HIT', 'STALE', 'UPDATING', 'REVALIDATED'].includes((response.headers.get('cf-cache-status') || '').toUpperCase())
      || Number(response.headers.get('age') || 0) > 0) fail('مسار SSE يعيد استجابة مخزنة.');
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    const nextFrame = async (budgetMs = frameTimeoutMs) => {
      frameTimer = setTimeout(() => controller.abort(), budgetMs);
      try {
        for (;;) {
          const boundary = pending.indexOf('\n\n');
          if (boundary >= 0) {
            const frame = pending.slice(0, boundary);
            pending = pending.slice(boundary + 2);
            return frame;
          }
          const chunk = await reader.read();
          if (chunk.done) fail('أُغلق SSE قبل التحقق من استمرار التدفق.');
          pending += decoder.decode(chunk.value, { stream: true }).replaceAll('\r', '');
          if (pending.length > 1024 * 1024) fail('لم يصل إطار SSE صالح ضمن الحجم المتوقع.');
        }
      } finally { clearTimeout(frameTimer); }
    };
    const remainingMs = frameTimeoutMs - (Date.now() - requestedAt);
    if (remainingMs <= 0) fail('تأخر SSE أو تجمعت استجابته؛ تحقق من إعدادات البروكسي.');
    const first = await nextFrame(remainingMs);
    try {
      const payload = first.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (first.includes('event: unavailable') || !Array.isArray(JSON.parse(payload).rooms)) fail('لم تصل قائمة المكالمات الفعلية.');
    } catch { fail('لم تصل قائمة المكالمات الفعلية.'); }
    const following = await nextFrame();
    if (following.includes('event: unavailable') || (!following.startsWith(': heartbeat') && !following.startsWith('data:'))) fail('تعذر استمرار تدفق المكالمات.');
    return { ok: true };
  } catch (error) {
    if (error instanceof CallStreamCheckError) throw error;
    fail(controller.signal.aborted ? 'تأخر SSE أو تجمعت استجابته؛ تحقق من إعدادات البروكسي.' : 'تعذر الاتصال بمسار SSE؛ تحقق من الرابط والشهادة والمصادقة.');
  } finally {
    clearTimeout(timeout);
    clearTimeout(frameTimer);
    controller.abort();
    if (reader) await reader.cancel().catch(() => undefined);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkCallStream({ url: process.env.CALLS_SSE_URL, headers: {
      Authorization: process.env.CALLS_SSE_AUTHORIZATION || '', Cookie: process.env.CALLS_SSE_COOKIE || '',
      'X-Registration-Number': process.env.CALLS_SSE_REGISTRATION_NUMBER || '',
      'X-Nukhab-Native': process.env.CALLS_SSE_AUTHORIZATION ? '1' : '0',
    } });
    process.stdout.write('نجح فحص المصادقة والترويسات والتدفق المستمر، دون طباعة بيانات المكالمات.\n');
  } catch (error) {
    process.stderr.write(`${error instanceof CallStreamCheckError ? error.message : 'تعذر فحص SSE.'}\n`);
    process.exitCode = 1;
  }
}
