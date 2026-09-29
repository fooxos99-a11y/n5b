const fail = (message) => { const error = new Error(message); error.status = 422; throw error; };
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function staffReportPeriod({ date, from, to, staffId = 'all' }, today) {
  const start = String(from || date || today);
  const end = String(to || date || today);
  if (!validDate(start) || !validDate(end) || start > end) fail('الفترة المحددة غير صحيحة.');
  const days = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (days > 366) fail('اختر فترة لا تتجاوز سنة.');
  if (staffId !== 'all' && !/^[1-9]\d*$/.test(String(staffId))) fail('معرّف الكادر غير صحيح.');
  return { from: start, to: end, staffId, days };
}

export async function loadStaffAttendanceReport(query, connection, today) {
  const period = staffReportPeriod(query, today);
  const params = [period.from, period.to];
  const filter = period.staffId === 'all' ? '' : ' AND s.id = ?';
  if (filter) params.push(period.staffId);
  const [records] = await connection.query(`
    SELECT s.id, s.name, s.login_number AS loginNumber, s.job_title AS jobTitle, s.role,
      DATE_FORMAT(s.created_at, '%Y-%m-%d') AS joined,
      ar.status, TIME_FORMAT(ar.check_in_time, '%H:%i') AS checkInTime,
      DATE_FORMAT(ar.record_date, '%Y-%m-%d') AS recordDate,
      ar.check_in_method AS checkInMethod,
      ar.distance_meters AS distance
    FROM supervisors s
    LEFT JOIN supervisor_attendance_records ar ON ar.supervisor_id = s.id
      AND ar.record_date BETWEEN ? AND ?
    WHERE s.role IN ('supervisor', 'reciter', 'admin') AND s.is_active = 1${filter}
    ORDER BY s.name ASC, ar.record_date DESC`, params);
  // Keep the legacy one-day response for manual attendance and offline clients.
  if (!query.from && !query.to) return { period, rows: records };
  const dates = Array.from({ length: period.days }, (_, index) =>
    new Date(Date.parse(period.from) + index * 86400000).toISOString().slice(0, 10)).reverse();
  const people = new Map();
  for (const row of records) {
    if (!people.has(row.id)) people.set(row.id, { person: row, records: new Map() });
    people.get(row.id).records.set(row.recordDate, row);
  }
  const rows = [];
  for (const { person, records: attendance } of people.values()) {
    for (const recordDate of dates) {
      if (person.joined && recordDate < person.joined) continue;
      rows.push(attendance.get(recordDate) || {
        ...person, recordDate, status: 'unrecorded', checkInTime: null,
        checkInMethod: null, distance: null,
      });
    }
  }
  return { period, rows };
}
