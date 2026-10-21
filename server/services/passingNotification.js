export async function notifyPassingCompletion(connection, { partId, attemptId }) {
  const [[attempt]] = await connection.query(`SELECT a.actor_name AS actorName,a.result_json AS result,a.rehifz_decision AS decision,
    p.juz_number AS juz,e.exam_type AS type,s.id AS studentId,s.name AS studentName,c.name AS committeeName,x.name AS complexName
    FROM student_passing_attempts a JOIN student_passing_parts p ON p.id=a.part_id
    JOIN student_passing_exams e ON e.id=p.exam_id JOIN students s ON s.id=e.student_id
    LEFT JOIN committees c ON c.id=s.committee_id LEFT JOIN complexes x ON x.id=c.complex_id
    WHERE a.id=? AND p.id=? AND a.actor_role='passing_guest'`, [attemptId, partId]);
  if (!attempt || attempt.decision === 'pending') return;
  const result = typeof attempt.result === 'string' ? JSON.parse(attempt.result) : attempt.result;
  const [recipients] = await connection.query(`SELECT s.id,s.role FROM supervisors s WHERE s.is_active=1
    AND (s.role='manager' OR (s.role='admin' AND EXISTS (SELECT 1 FROM supervisor_dashboard_permissions p
      WHERE p.supervisor_id=s.id AND p.permission_key='quranPassing')))`);
  if (!recipients.length) return;
  const body = [`${attempt.studentName} · الجزء ${attempt.juz} · ${result.passed ? 'اجتاز' : 'يحتاج إعادة'} · ${result.score}/${result.maxScore}`,
    [attempt.complexName, attempt.committeeName].filter(Boolean).join('، '), `المقرئ: ${attempt.actorName}`,
    attempt.decision === 'repeat' ? 'إعادة حفظ الجزء كاملًا' : 'إبقاء الخطة'].filter(Boolean).join('\n');
  const [saved] = await connection.query(`INSERT INTO app_notifications(title,body,dedupe_key,recipient_type,created_by_role,created_by_name,action_json)
    VALUES(?,?,?,'specific','system','النظام',?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`,
  ['نتيجة اجتياز', body, `passing-attempt:${attemptId}`, JSON.stringify({ kind: 'passing', studentId: Number(attempt.studentId), type: attempt.type, juz: Number(attempt.juz) })]);
  for (const person of recipients) await connection.query('INSERT IGNORE INTO app_notification_recipients(notification_id,user_role,user_id) VALUES(?,?,?)', [saved.insertId, person.role, person.id]);
  await connection.query(`INSERT IGNORE INTO notification_push_deliveries(notification_id,device_id,user_role,user_id)
    SELECT r.notification_id,d.id,r.user_role,r.user_id FROM app_notification_recipients r
    JOIN notification_devices d ON d.user_role=r.user_role AND d.user_id=r.user_id WHERE r.notification_id=?`, [saved.insertId]);
}
