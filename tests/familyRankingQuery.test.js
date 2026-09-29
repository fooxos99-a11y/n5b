import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('family rankings average cumulative student points without multiplying by family size', () => {
  const source = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf("app.get('/api/rankings/families'"));
  const query = route.match(/`(SELECT c\.id[\s\S]*?)`/)[1];
  const db = new DatabaseSync(':memory:');
  try {
    db.function('GREATEST', { varargs: true }, (...values) => Math.max(...values));
    db.exec(`CREATE TABLE committees (id INTEGER, name TEXT, points INTEGER);
      CREATE TABLE students (id INTEGER, committee_id INTEGER, points INTEGER);
      INSERT INTO committees VALUES (1, 'A', 400000), (2, 'B', 300000), (3, 'C', 0);
      INSERT INTO students VALUES (1, 1, 8000), (2, 1, 12000), (3, 2, 9999);`);
    const rows = db.prepare(query).all();
    assert.deepEqual(rows.map(row => [row.id, row.averagePoints, row.studentsCount]), [[1, 10000, 2], [2, 9999, 1], [3, 0, 0]]);
  } finally {
    db.close();
  }
});
