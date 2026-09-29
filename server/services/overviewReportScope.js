// Only the report builder supplies SQL. Scope values remain bound parameters.
export function createOverviewReportScope(connection, { auth = null, committeeId = 'all' } = {}) {
  const teacherId = auth?.role === 'supervisor' ? Number(auth.id) : null;
  const selectedCommitteeId = committeeId === 'all' || committeeId == null ? null : Number(committeeId);
  if ((teacherId !== null && (!Number.isSafeInteger(teacherId) || teacherId <= 0))
    || (selectedCommitteeId !== null && (!Number.isSafeInteger(selectedCommitteeId) || selectedCommitteeId <= 0))) {
    throw Object.assign(new Error('الحلقة أو الحساب غير صالح.'), { status: 422 });
  }
  const committee = (column) => [
    teacherId !== null ? `EXISTS (SELECT 1 FROM supervisor_committees overview_sc WHERE overview_sc.committee_id = ${column} AND overview_sc.supervisor_id = :overviewTeacher)` : '1=1',
    selectedCommitteeId !== null ? `${column} = :overviewCommittee` : '1=1',
  ].join(' AND ');
  const student = (column) => teacherId !== null || selectedCommitteeId !== null
    ? `${column} IN (SELECT overview_student.id FROM students overview_student WHERE ${committee('overview_student.committee_id')})` : '1=1';
  const staff = (column) => {
  if (teacherId !== null) {
    return `${column} = :overviewTeacher`;
  }
  if (selectedCommitteeId !== null) {
    return `EXISTS (SELECT 1 FROM supervisor_committees overview_staff WHERE overview_staff.supervisor_id = ${column} AND overview_staff.committee_id = :overviewCommittee)`;
  }
  return '1=1';
};
  return {
    committee, student, staff,
    query: (sql, parameters = []) => {
      let index = 0;
      const values = [];
      const boundSql = sql.replace(/:overviewTeacher|:overviewCommittee|\?/g, (token) => {
        const _resolveBoundSql = () => {
          if (token === ':overviewTeacher') {
            return teacherId;
          }
          if (token === ':overviewCommittee') {
            return selectedCommitteeId;
          }
          return parameters[index++];
        };
        values.push(_resolveBoundSql());
        return '?';
      });
      return connection.query(boundSql, values);
    },
  };
}
