/** Keep late attendance counted while separating excused absence from unexcused absence. */
export function sessionAttendanceCountsSql(alias = '') {
  const column = alias ? `${alias}.` : '';
  const status = `JSON_UNQUOTE(JSON_EXTRACT(${column}detail_json, '$.attendanceStatus'))`;
  const recorded = `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(${column}detail_json, '$.attendanceRecorded')), 'true') <> 'false'`;
  return `COALESCE(SUM(${column}attended = 1 AND ${recorded}), 0) AS attended,
    COALESCE(SUM(${column}attended = 0 AND ${recorded} AND COALESCE(${status}, 'absent') <> 'excused'), 0) AS absent,
    COALESCE(SUM(${status} = 'late'), 0) AS late,
    COALESCE(SUM(${status} = 'excused'), 0) AS excused`;
}
