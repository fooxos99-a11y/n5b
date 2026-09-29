import { quranFacePositions } from '../services/quranFaceMeasurement.js';
export const version = '2026.09.09.5';
export async function up(connection) {
  await connection.query(`CREATE TABLE IF NOT EXISTS quran_face_positions (
    surah SMALLINT UNSIGNED NOT NULL, ayah SMALLINT UNSIGNED NOT NULL,
    forward_start INT NOT NULL, forward_end INT NOT NULL,
    reverse_start INT NOT NULL, reverse_end INT NOT NULL,
    PRIMARY KEY (surah, ayah)
  ) ENGINE=InnoDB`);
  for (let offset=0;offset<quranFacePositions.length;offset+=500) {
    const rows=quranFacePositions.slice(offset,offset+500);
    await connection.query(`INSERT INTO quran_face_positions (surah,ayah,forward_start,forward_end,reverse_start,reverse_end)
      VALUES ${rows.map(()=>'(?,?,?,?,?,?)').join(',')}
      ON DUPLICATE KEY UPDATE forward_start=VALUES(forward_start),forward_end=VALUES(forward_end),reverse_start=VALUES(reverse_start),reverse_end=VALUES(reverse_end)`,
    rows.flatMap(row=>[row.surah,row.ayah,row.forwardStart,row.forwardEnd,row.reverseStart,row.reverseEnd]));
  }
}
export async function down(connection) {
  await connection.query('DROP TABLE IF EXISTS quran_face_positions');
}
