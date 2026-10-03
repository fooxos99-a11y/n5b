import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { trackSegmentDefinitions } from '../../shared/grading-policy.js';
import { readQuranRange } from './quranReferenceCache.js';
import { addDays } from './grading.js';

const position = (surah, ayah) => Number(surah) * 1000 + Number(ayah);
const invalid = message => Object.assign(new Error(message), { status: 422, statusCode: 422 });
const fingerprint = policy => createHash('sha256').update(JSON.stringify(policy.trackSession)).digest('hex');
const identity = auth => JSON.stringify([auth.role, auth.id, auth.tokenHash || null]);

/** Whole contiguous page portions, clipped to the assigned verses; gaps never join. */
export function trackRangeCandidates(ayahs, tasks) {
  const spans = tasks.map(task => [position(task.fromSurah, task.fromAyah), position(task.toSurah, task.toAyah)])
    .filter(([first, last]) => first <= last);
  const groups = [];
  let previous = -2;
  ayahs.forEach((ayah, index) => {
    const value = position(ayah.surah, ayah.ayah);
    if (!spans.some(([first, last]) => value >= first && value <= last)) return;
    const group = groups.at(-1);
    if (group && previous + 1 === index && group[0].page === ayah.page) group.push(ayah);
    else groups.push([ayah]);
    previous = index;
  });
  return groups.map(group => {
    const first = group[0], last = group.at(-1);
    return { fromSurah: first.surah, fromAyah: first.ayah, toSurah: last.surah, toAyah: last.ayah,
      fromSurahName: first.surahName, toSurahName: last.surahName };
  });
}

/** Per-router signing key isolates attempts by server/database and authenticated session.
 * Restarting the API expires an open draft; the teacher can reopen the test safely. */
export function createTrackTestAttempts({ now = Date.now, pick = randomInt } = {}) {
  const key = randomBytes(32);
  const sign = payload => createHmac('sha256', key).update(payload).digest();
  return {
    async prepare(connection, { studentId, weekStart, today, policy, auth }) {
      const end = [addDays(weekStart, 6), today].sort()[0];
      const [tasks] = await connection.query(`SELECT task_type AS source, DATE_FORMAT(task_date, '%Y-%m-%d') AS date,
        from_surah AS fromSurah, from_ayah AS fromAyah, to_surah AS toSurah, to_ayah AS toAyah
        FROM student_quran_tasks WHERE student_id = ? AND task_date BETWEEN ? AND ? AND task_type IN ('link', 'review')
        ORDER BY task_date DESC, id DESC`, [studentId, weekStart, end]);
      const ayahs = await readQuranRange(connection, 1, 604);
      const pools = new Map();
      const segments = trackSegmentDefinitions(policy).map(definition => {
        if (!pools.has(definition.source)) {
          const rows = tasks.filter(task => task.source === definition.source);
          const candidates = trackRangeCandidates(ayahs, rows.filter(task => task.date === rows[0]?.date));
          pools.set(definition.source, { candidates, remaining: [...candidates] });
        }
        const pool = pools.get(definition.source);
        if (!pool.candidates.length) throw invalid(`لا يوجد مقدار ${definition.source === 'link' ? 'ربط' : 'مراجعة'} مقرر لهذا الطالب في الأسبوع المحدد.`);
        if (!pool.remaining.length) pool.remaining = [...pool.candidates];
        const [range] = pool.remaining.splice(pick(pool.remaining.length), 1);
        return { ...definition, range };
      });
      const payload = Buffer.from(JSON.stringify({ studentId, weekStart, owner: identity(auth), policy: fingerprint(policy),
        expires: now() + 2 * 60 * 60 * 1000, segments })).toString('base64url');
      return { segments, attemptToken: `${payload}.${sign(payload).toString('base64url')}` };
    },
    verify(token, { studentId, weekStart, policy, auth, segments }) {
      try {
        if (typeof token !== 'string' || token.length > 16000) throw new Error('Invalid token');
        const [payload, signature, extra] = token.split('.');
        const actual = Buffer.from(signature || '', 'base64url'), expected = sign(payload || '');
        if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid signature');
        const draft = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (draft.studentId !== studentId || draft.weekStart !== weekStart || draft.owner !== identity(auth)
          || draft.policy !== fingerprint(policy) || draft.expires <= now() || draft.segments.length !== segments.length) throw new Error('Expired or mismatched draft');
        return draft.segments.map((item, index) => {
          const submitted = segments[index];
          if (!submitted.recorded || ['fromSurah', 'fromAyah', 'toSurah', 'toAyah'].some(field => Number(submitted.range?.[field]) !== item.range[field])) throw new Error('Changed range');
          return { ...submitted, range: item.range };
        });
      } catch {
        throw invalid('تعذر اعتماد مقاطع الاختبار. أغلق الاختبار وافتحه من جديد.');
      }
    },
  };
}
