// Only the report builder supplies SQL. Scope values remain bound parameters.
export function createOverviewReportScope(connection, { auth = null, committeeId = 'all', complexId = 'all' } = {}) {
  const teacherId = auth?.role === 'supervisor' ? Number(auth.id) : null;
  const selectedCommitteeId = committeeId === 'all' || committeeId == null ? null : Number(committeeId);
  const selectedComplexId = complexId === 'all' || complexId == null ? null : Number(complexId);
  if ((teacherId !== null && (!Number.isSafeInteger(teacherId) || teacherId <= 0))
    || (selectedCommitteeId !== null && (!Number.isSafeInteger(selectedCommitteeId) || selectedCommitteeId <= 0))
    || (selectedComplexId !== null && (!Number.isSafeInteger(selectedComplexId) || selectedComplexId <= 0))) {
    throw Object.assign(new Error('المجمع أو الحلقة أو الحساب غير صالح.'), { status: 422 });
  }
  const committee = (column) => [
    teacherId !== null ? `EXISTS (SELECT 1 FROM supervisor_committees overview_sc WHERE overview_sc.committee_id = ${column} AND overview_sc.supervisor_id = :overviewTeacher)` : '1=1',
    selectedCommitteeId !== null ? `${column} = :overviewCommittee` : '1=1',
    selectedComplexId !== null ? `${column} IN (SELECT overview_complex.id FROM committees overview_complex WHERE overview_complex.complex_id = :overviewComplex)` : '1=1',
  ].join(' AND ');
  const student = (column) => teacherId !== null || selectedCommitteeId !== null || selectedComplexId !== null
    ? `${column} IN (SELECT overview_student.id FROM students overview_student WHERE ${committee('overview_student.committee_id')})` : '1=1';
  const complex = column => [
    selectedComplexId !== null ? `${column} = :overviewComplex` : '1=1',
    teacherId !== null || selectedCommitteeId !== null
      ? `EXISTS (SELECT 1 FROM committees overview_circle WHERE overview_circle.complex_id = ${column} AND ${committee('overview_circle.id')})` : '1=1',
  ].join(' AND ');
  const staff = (column) => {
  if (teacherId !== null) {
    return `${column} = :overviewTeacher`;
  }
  if (selectedCommitteeId !== null || selectedComplexId !== null) {
    return `EXISTS (SELECT 1 FROM supervisor_committees overview_staff WHERE overview_staff.supervisor_id = ${column} AND ${committee('overview_staff.committee_id')})`;
  }
  return '1=1';
};
  return {
    committee, student, staff, complex,
    query: (sql, parameters = []) => {
      let index = 0;
      const values = [];
      const boundSql = sql.replace(/:overviewTeacher|:overviewCommittee|:overviewComplex|\?/g, (token) => {
        const _resolveBoundSql = () => {
          if (token === ':overviewTeacher') {
            return teacherId;
          }
          if (token === ':overviewCommittee') {
            return selectedCommitteeId;
          }
          if (token === ':overviewComplex') return selectedComplexId;
          return parameters[index++];
        };
        values.push(_resolveBoundSql());
        return '?';
      });
      return connection.query(boundSql, values);
    },
  };
}
