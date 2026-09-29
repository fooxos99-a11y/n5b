export function createNotificationReadHandler(getDatabase) {
  return async (req, res, next) => {
    try {
      const ids = req.body.ids;
      if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => !/^\d+$/.test(String(id)))) {
        return res.status(422).json({ message: 'الإشعارات المحددة غير صالحة.' });
      }
      if (ids.length) await getDatabase().query(`UPDATE app_notification_recipients
        SET read_at = COALESCE(read_at, NOW())
        WHERE user_role = ? AND user_id = ? AND notification_id IN (?)`, [req.auth.role, req.auth.id, ids]);
      res.json({ ok: true });
    } catch (error) { next(error); }
  };
}
