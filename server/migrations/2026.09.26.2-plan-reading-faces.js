import { DEFAULT_PLAN_READING_FACES } from '../../shared/quran-plan-options.js';

export const version = '2026.09.26.1.1';

/** The daily self-reading amount now belongs to every plan instead of a global setting. */
export async function up(connection) {
  await connection.query('UPDATE student_quran_plans SET reading_faces = ? WHERE reading_faces IS NULL', [DEFAULT_PLAN_READING_FACES]);
  await connection.query(
    `ALTER TABLE student_quran_plans MODIFY COLUMN reading_faces SMALLINT UNSIGNED NOT NULL DEFAULT ${Number(DEFAULT_PLAN_READING_FACES)}`,
  );
}

export async function down(connection) {
  await connection.query('ALTER TABLE student_quran_plans MODIFY COLUMN reading_faces DECIMAL(6,2) NULL');
}
