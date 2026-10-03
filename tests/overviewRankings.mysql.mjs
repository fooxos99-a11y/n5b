import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';
import { buildOverviewRankings } from '../server/services/overviewRankings.js';

assert.ok(['localhost', '127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE, 'nukhab_local');
const connection = await mysql.createConnection({ host: process.env.MYSQL_HOST, port: Number(process.env.MYSQL_PORT), user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE });
const database = `nukhab_ranking_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
try {
  await connection.query('CREATE DATABASE ??', [database]);
  await connection.query('USE ??', [database]);
  for (const schema of [
    'complexes (id INT PRIMARY KEY, name VARCHAR(100))',
    'committees (id INT PRIMARY KEY, name VARCHAR(100), complex_id INT)',
    'students (id INT PRIMARY KEY, name VARCHAR(100), committee_id INT)',
    'supervisors (id INT PRIMARY KEY, name VARCHAR(100), created_at DATE, role VARCHAR(30), is_active INT)',
    'supervisor_committees (supervisor_id INT, committee_id INT)',
    'student_point_transactions (student_id INT, transaction_type VARCHAR(20), points DECIMAL(10,2), dedupe_key VARCHAR(100), transaction_date DATE)',
    'student_daily_grades (student_id INT, grade DECIMAL(10,2), max_grade DECIMAL(10,2), grade_date DATE)',
  ]) await connection.query(`CREATE TABLE ${schema}`);
  await connection.query("INSERT INTO complexes VALUES (1,'First'),(2,'Second'),(3,'Empty')");
  for (let id = 1; id <= 12; id++) {
    await connection.query('INSERT INTO committees VALUES (?, ?, ?)', [id, 'Same name', id <= 6 ? 1 : 2]);
    for (let offset = 0; offset < 2; offset++) await connection.query('INSERT INTO students VALUES (?, ?, ?)', [id * 2 + offset, `Student ${id}-${offset}`, id]);
  }
  await connection.query("INSERT INTO committees VALUES (13,'Empty circle',2),(14,'Unassigned circle',NULL)");
  await connection.query("INSERT INTO students VALUES (99,'Unassigned student',14)");
  await connection.query("INSERT INTO supervisors VALUES (7,'Teacher','2026-09-20','supervisor',1)");
  await connection.query('INSERT INTO supervisor_committees VALUES (7,1),(7,7)');
  const report = async filters => {
    const scope = createOverviewReportScope(connection, filters);
    const [students] = await scope.query(`SELECT s.id,s.name,s.committee_id AS committeeId FROM students s WHERE ${scope.student('s.id')}`);
    const studentsList = students.filter(student => student.id !== 99).map(student => ({ ...student, grade: student.committeeId <= 6 ? 80 : 40, max: 100 }));
    return buildOverviewRankings(scope, { from: '2026-09-20', to: '2026-09-26', grades: { weeklyProgram: { studentsList } } });
  };
  const all = await report({});
  assert.equal(all.bestStudents.length, 25);
  assert.equal(all.bestCommittees.length, 14);
  assert.equal(all.bestComplexes.length, 3);
  assert.equal(all.bestCommittees.find(row => row.id === 1).percentage, 80);
  assert.equal(all.bestCommittees.find(row => row.id === 7).percentage, 40);
  assert.equal(all.bestStudents.find(row => row.id === 99).percentage, null);
  assert.equal(all.bestComplexes.find(row => row.id === 3).percentage, null);
  const first = await report({ complexId: 1 });
  assert.equal(first.bestStudents.length, 12);
  assert.equal(first.bestCommittees.length, 6);
  assert.deepEqual(first.bestComplexes.map(row => row.id), [1]);
  assert.ok(first.bestStudents.every(row => row.complexId === 1));
  const circle = await report({ committeeId: 7 });
  assert.equal(circle.bestStudents.length, 2);
  assert.deepEqual(circle.bestCommittees.map(row => row.id), [7]);
  assert.deepEqual(circle.bestComplexes.map(row => row.id), [2]);
  const mismatch = await report({ complexId: 1, committeeId: 7 });
  assert.deepEqual([mismatch.bestStudents, mismatch.bestCommittees, mismatch.bestComplexes], [[], [], []]);
  const empty = await report({ complexId: 3 });
  assert.deepEqual([empty.bestStudents, empty.bestCommittees], [[], []]);
  assert.deepEqual(empty.bestComplexes.map(row => row.id), [3]);
  const teacher = await report({ auth: { role: 'supervisor', id: 7 } });
  assert.equal(teacher.bestStudents.length, 4);
  assert.deepEqual(teacher.bestCommittees.map(row => row.id), [1, 7]);
  assert.deepEqual(teacher.bestComplexes.map(row => row.id), [1, 2]);
  const denied = await report({ auth: { role: 'supervisor', id: 8 } });
  assert.deepEqual([denied.bestStudents, denied.bestCommittees, denied.bestComplexes], [[], [], []]);
  const outside = await report({ auth: { role: 'supervisor', id: 7 }, committeeId: 2 });
  assert.deepEqual([outside.bestStudents, outside.bestCommittees, outside.bestComplexes], [[], [], []]);
  const legacy = await buildOverviewRankings(createOverviewReportScope(connection), { from: '2026-09-20', to: '2026-09-26' });
  assert.equal(legacy.bestStudents.length, 25);
  assert.equal(legacy.bestCommittees.length, 14);
  assert.equal(legacy.bestComplexes.length, 3);
  await connection.query(`INSERT INTO student_point_transactions VALUES
    (2,'award',10.5,'grade:daily:2','2026-09-20'),
    (2,'award',20,'grade:weekly:2','2026-09-26'),
    (2,'award',5,'grade:narration:2','2026-09-22'),
    (2,'deduction',2,'grade:deduction:2','2026-09-23'),
    (2,'award',999,'grade:previous:2','2026-09-19'),
    (2,'award',999,'grade:next:2','2026-09-27'),
    (2,'award',999,'manual:2','2026-09-22'),
    (3,'award',40,'grade:daily:3','2026-09-27')`);
  const periodGrades = await buildOverviewRankings(createOverviewReportScope(connection), { from: '2026-09-20', to: '2026-09-26' });
  assert.equal(periodGrades.bestStudents[0].id, 2);
  assert.equal(periodGrades.bestStudents[0].grade, 33.5);
  const nextDay = await buildOverviewRankings(createOverviewReportScope(connection), { from: '2026-09-27', to: '2026-09-27' });
  assert.deepEqual(nextDay.bestStudents.slice(0, 2).map(row => [row.id, row.grade]), [[2, 999], [3, 40]]);
  process.stdout.write('Isolated MySQL passed: all rankings, duplicate circle names, complex/circle filters, empty and unassigned groups, and teacher access boundaries.\n');
} finally {
  try { assert.match(database, /^nukhab_ranking_[a-f0-9]{16}$/); await connection.query('DROP DATABASE IF EXISTS ??', [database]); }
  finally { await connection.end(); }
}
