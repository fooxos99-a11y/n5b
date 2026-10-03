import '../server/loadEnvironment.js';
import process from 'node:process';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { createOverviewReportScope } from '../server/services/overviewReportScope.js';

assert.ok(['localhost','127.0.0.1'].includes(process.env.MYSQL_HOST));
assert.equal(process.env.MYSQL_DATABASE,'nukhab_local');
const connection = await mysql.createConnection({ host:process.env.MYSQL_HOST,port:Number(process.env.MYSQL_PORT),user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE });
const database = `nukhab_complex_scope_${randomUUID().replaceAll('-', '').slice(0,16)}`;
try {
  // MySQL cannot read one temporary table twice in a query, so use an isolated disposable schema.
  await connection.query('CREATE DATABASE ??',[database]);
  await connection.query('USE ??',[database]);
  await connection.query('CREATE TABLE committees (id INT,complex_id INT)');
  await connection.query('CREATE TABLE students (id INT,committee_id INT)');
  await connection.query('CREATE TABLE supervisors (id INT)');
  await connection.query('CREATE TABLE supervisor_committees (supervisor_id INT,committee_id INT)');
  await connection.query('INSERT INTO committees VALUES (10,1),(20,1),(30,2),(40,NULL)');
  await connection.query('INSERT INTO students VALUES (1,10),(2,20),(3,30),(4,40)');
  await connection.query('INSERT INTO supervisors VALUES (7),(8),(9)');
  await connection.query('INSERT INTO supervisor_committees VALUES (7,10),(7,20),(8,30),(9,20),(9,30)');
  for (const [filters,students,circles,staff] of [
    [{},4,4,3], [{complexId:1},2,2,2], [{complexId:2},1,1,2], [{complexId:99},0,0,0],
    [{complexId:1,committeeId:10},1,1,1], [{complexId:1,committeeId:30},0,0,0],
    [{complexId:1,auth:{role:'supervisor',id:8}},0,0,1], [{complexId:1,auth:{role:'supervisor',id:7}},2,2,1],
  ]) {
    const scope = createOverviewReportScope(connection,filters);
    const [[result]] = await scope.query(`SELECT
      (SELECT COUNT(*) FROM students s WHERE ${scope.student('s.id')}) AS students,
      (SELECT COUNT(*) FROM committees c WHERE ${scope.committee('c.id')}) AS circles,
      (SELECT COUNT(*) FROM supervisors s WHERE ${scope.staff('s.id')}) AS staff`);
    assert.deepEqual([Number(result.students),Number(result.circles),Number(result.staff)],[students,circles,staff]);
  }
  globalThis.console.log('Isolated MySQL passed: complex/circle intersections, unassigned circles, empty complex, staff deduplication and teacher access boundaries. Operational data unchanged.');
} finally {
  try { assert.match(database,/^nukhab_complex_scope_[a-f0-9]{16}$/); await connection.query('DROP DATABASE IF EXISTS ??',[database]); }
  finally { await connection.end(); }
}
