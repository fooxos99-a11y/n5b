import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

assert.equal(process.env.NUKHAB_APP_VARIANT, 'testflight-preview');
assert.equal(process.env.MYSQL_USER, 'nukhab_preview');
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_expo_preview');
assert.equal(process.env.PLATFORM_MYSQL_DATABASE, 'nukhab_expo_preview_platform');
assert.equal(JSON.parse(await readFile('../owner.json', 'utf8')).owner, 'nukhab-expo-preview');
const password = process.env.NUKHAB_PREVIEW_PASSWORD;
assert.ok(password && password.length >= 16, 'Supply a separate synthetic account password');
const { initDatabase } = await import('../server/db.js');
const { hashStudentPassword } = await import('../server/services/studentPassword.js');
const { getSaudiCalendarDate, shiftDateOnly } = await import('../shared/business-date.js');
const pool = await initDatabase('nukhab_expo_preview', { seedDefaultData: false });
const connection = await pool.getConnection();
try {
  const [[identity]] = await connection.query('SELECT DATABASE() AS name, CURRENT_USER() AS actor');
  assert.equal(identity.name, 'nukhab_expo_preview');
  assert.ok(identity.actor.startsWith('nukhab_preview@'));
  const [[count]] = await connection.query('SELECT (SELECT COUNT(*) FROM students)+(SELECT COUNT(*) FROM supervisors) AS total');
  assert.equal(Number(count.total), 0, 'Refuse to overwrite retained preview accounts');
  const passwordHash = await hashStudentPassword(password);
  const today = getSaudiCalendarDate();
  await connection.beginTransaction();
  for (const [key, value] of [['automaticAbsenceMessageEnabled', 'false'], ['recitationAttendanceSource', 'teacher'],
    ['currentTermStartDate', shiftDateOnly(today, -30)], ['weeklyHolidayDays', '[]'],
    ['platformPolicy:studentsSectionEnabled', 'tenant']]) {
    await connection.query('INSERT INTO app_settings(setting_key,setting_value) VALUES (?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)', [key, value]);
  }
  const people = {};
  for (const [name, role, login, permissions] of [
    ['مدير التجربة', 'manager', '940001', []], ['إداري التجربة', 'admin', '940004', ['settings', 'notifications']],
    ['إداري دون منح', 'admin', '940005', []], ['مشرف التجربة', 'supervisor', '940006', []]]) {
    const [row] = await connection.query("INSERT INTO supervisors(name,login_number,national_id,phone,job_title,role,password_hash,is_active) VALUES (?,?,'','','',?,?,1)", [name, login, role, passwordHash]);
    people[role] = row.insertId;
    for (const permission of permissions) await connection.query('INSERT INTO supervisor_dashboard_permissions(supervisor_id,permission_key) VALUES (?,?)', [row.insertId, permission]);
  }
  const [complex] = await connection.query('INSERT INTO complexes(name) VALUES (?)', ['مجمع التجربة']);
  const [circle] = await connection.query('INSERT INTO committees(name,complex_id) VALUES (?,?)', ['حلقة التجربة', complex.insertId]);
  await connection.query('INSERT INTO supervisor_committees(supervisor_id,committee_id) VALUES (?,?)', [people.supervisor, circle.insertId]);
  for (const [name, login] of [['طالب التجربة الأول', '940101'], ['طالب التجربة الثاني', '940102']]) {
    await connection.query("INSERT INTO students(name,login_number,national_id,guardian_phone,phone,committee_id,password_hash) VALUES (?,?,'','','',?,?)", [name, login, circle.insertId, passwordHash]);
  }
  await connection.commit();
  console.info('Seeded six synthetic accounts with blank contacts; no production data imported');
} catch (error) {
  await connection.rollback();
  throw error;
} finally {
  connection.release();
  await pool.end();
}
