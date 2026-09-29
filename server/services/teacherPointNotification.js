// Use the same transaction as the point movement: neither may outlive a rollback.
export async function notifyTeacherPointAdjustment(connection, {
  transactionId, studentId, type, points, reason, actor,
}) {
  if (((Number(transactionId) || 0) <= 0) || ((Number(points) || 0) <= 0)) return null;
  const increase = type === 'increase';
  const [notification] = await connection.query(
    `INSERT INTO app_notifications
      (title, body, dedupe_key, recipient_type, created_by_role, created_by_id, created_by_name)
     VALUES (?, ?, ?, 'specific', 'supervisor', ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [increase ? 'إضافة من المعلم' : 'خصم من المعلم',
      `${increase ? 'أضاف' : 'خصم'} المعلم ${actor.name || 'المعلم'} ${points} نقطة. السبب: ${reason}`,
      `teacher-points:${transactionId}`, actor.id, actor.name || 'المعلم'],
  );
  const notificationId = Number(notification.insertId);
  await connection.query(
    `INSERT IGNORE INTO app_notification_recipients (notification_id, user_role, user_id)
     VALUES (?, 'student', ?)`, [notificationId, studentId],
  );
  await connection.query(
    `INSERT IGNORE INTO notification_push_deliveries (notification_id, device_id, user_role, user_id)
     SELECT r.notification_id, d.id, r.user_role, r.user_id FROM app_notification_recipients r
     JOIN notification_devices d ON d.user_role = r.user_role AND d.user_id = r.user_id
     WHERE r.notification_id = ?`, [notificationId],
  );
  return notificationId;
}
