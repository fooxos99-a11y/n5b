export const version = '2026.09.27.1';

/** «لحن» joins mistake and warning as a word mark; it is graded as a mistake. */
export async function up(connection) {
  await connection.query("ALTER TABLE student_quran_task_word_marks MODIFY COLUMN mark_type ENUM('mistake', 'warning', 'lahn') NOT NULL");
}

export async function down(connection) {
  await connection.query("UPDATE student_quran_task_word_marks SET mark_type = 'mistake' WHERE mark_type = 'lahn'");
  await connection.query("ALTER TABLE student_quran_task_word_marks MODIFY COLUMN mark_type ENUM('mistake', 'warning') NOT NULL");
}
