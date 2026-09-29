import { createHash } from 'node:crypto';

/** Retain an uncertain delivery receipt before calling the external service; never resend it silently. */
export async function sendWhatsAppOnce(pool, { phone, message, attachment = null, studentId = null, send }) {
  const key = `broadcast:${createHash('sha256').update(JSON.stringify([phone, message, attachment])).digest('hex')}`;
  const connection = await pool.getConnection();
  const lockName = `wa:${key.slice(-60)}`;
  let locked = false;
  try {
    const [[lock]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    locked = Number(lock?.acquired) === 1;
    if (!locked) throw new Error('إرسال هذه الرسالة قيد التنفيذ؛ انتظر اكتماله.');
    const [[previous]] = await connection.query(`SELECT id, status FROM whatsapp_messages
      WHERE message_type = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE) ORDER BY id DESC LIMIT 1`, [key]);
    if (previous?.status === 'sent') return previous.id;
    if (previous) throw new Error('سبق بدء إرسال هذه الرسالة ولم يتأكد وصولها. تحقق من واتساب قبل تكرارها.');
    const [receipt] = await connection.query(`INSERT INTO whatsapp_messages
      (student_id, guardian_phone, message, status, message_type) VALUES (?, ?, ?, 'prepared', ?)`,
    [studentId, phone, message, key]);
    await send(phone, message, attachment);
    await connection.query("UPDATE whatsapp_messages SET status = 'sent' WHERE id = ?", [receipt.insertId]);
    return receipt.insertId;
  } finally {
    try {
      if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
    } finally { connection.release(); }
  }
}
