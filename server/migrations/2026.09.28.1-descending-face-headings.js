import { buildQuranFacePositions } from '../services/quranFaceMeasurement.js';

export const version = '2026.09.28.1';

async function writePositions(connection, includeHeadings) {
  const positions = buildQuranFacePositions({ includeHeadings });
  for (let offset = 0; offset < positions.length; offset += 500) {
    const rows = positions.slice(offset, offset + 500);
    await connection.query(`INSERT INTO quran_face_positions
      (surah, ayah, forward_start, forward_end, reverse_start, reverse_end)
      VALUES ${rows.map(() => '(?,?,?,?,?,?)').join(',')}
      ON DUPLICATE KEY UPDATE forward_start=VALUES(forward_start), forward_end=VALUES(forward_end),
        reverse_start=VALUES(reverse_start), reverse_end=VALUES(reverse_end)`,
    rows.flatMap(row => [row.surah, row.ayah, row.forwardStart, row.forwardEnd, row.reverseStart, row.reverseEnd]));
  }
}

export const up = connection => writePositions(connection, true);
export const down = connection => writePositions(connection, false);
