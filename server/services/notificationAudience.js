import { notificationRoles, notificationStaffRoles } from '../../shared/notification-roles.js';

const roles = new Set(notificationRoles);
const invalid = (message) => Object.assign(new Error(message), { status: 422 });

export function normalizeNotification(payload = {}) {
  if (!payload || typeof payload !== 'object') throw invalid('بيانات الإشعار غير صالحة.');
  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();
  if (!title || title.length > 180 || !body || body.length > 4000) throw invalid('أدخل عنوانًا حتى 180 حرفًا ونصًا حتى 4000 حرف.');
  if (!/^[a-f\d-]{36}$/i.test(String(payload.requestId || ''))) throw invalid('معرف الإرسال غير صالح.');
  return { title, body, requestId: payload.requestId };
}

export function selectNotificationRecipients(people, selection = {}) {
  if (!selection || typeof selection !== 'object') throw invalid('حدد المستلمين.');
  if (!Array.isArray(selection.roles) || !Array.isArray(selection.committeeIds) || !Array.isArray(selection.people)) throw invalid('حدد المستلمين.');
  if (selection.roles.some((role) => !roles.has(role))) throw invalid('فئة المستلمين غير صالحة.');
  const selectedRoles = new Set(selection.roles);
  const committees = new Set(selection.committeeIds.map(String));
  const selectedPeople = new Set(selection.people.map(String));
  const knownPeople = new Set(people.map((person) => `${person.role}:${person.id}`));
  if ([...selectedPeople].some((key) => !knownPeople.has(key))) throw invalid('تغيرت قائمة المستلمين؛ أعد تحميلها.');
  return people.filter((person) => selectedRoles.has(person.role)
    || (person.role === 'student' && committees.has(String(person.committeeId)))
    || selectedPeople.has(`${person.role}:${person.id}`));
}

export async function loadNotificationAudience(connection) {
  const [people] = await connection.query(`
    SELECT id, name, 'student' AS role, committee_id AS committeeId FROM students
    UNION ALL
    SELECT id, name, role, NULL AS committeeId FROM supervisors
    WHERE is_active = 1 AND role IN (?)
    ORDER BY name`, [notificationStaffRoles]);
  const [committees] = await connection.query('SELECT id, name FROM committees ORDER BY name');
  return { people, committees };
}
