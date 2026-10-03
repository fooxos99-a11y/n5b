import express from 'express';
import { db } from '../db.js';
import { requirePermission } from '../services/dashboardPermissions.js';

export function createComplexRouter() {
  const router = express.Router();
  router.get('/', requirePermission(['families', 'students', 'reports', 'narrationDay']), async (_req, res, next) => {
    try {
      const [rows] = await db().query(`SELECT c.id, c.name, COUNT(k.id) AS committeesCount
        FROM complexes c LEFT JOIN committees k ON k.complex_id = c.id GROUP BY c.id, c.name ORDER BY c.name`);
      res.json(rows);
    } catch (error) { next(error); }
  });
  const save = update => async (req, res, next) => {
    try {
      const name = String(req.body.name || '').trim();
      if (!name || name.length > 180) return res.status(422).json({ message: 'أدخل اسم المجمع، بحد أقصى 180 حرفًا.' });
      const [result] = await db().query(update ? 'UPDATE complexes SET name = ? WHERE id = ?' : 'INSERT INTO complexes (name) VALUES (?)', update ? [name, req.params.id] : [name]);
      if (update && !result.affectedRows) return res.status(404).json({ message: 'المجمع غير موجود.' });
      return res.status(update ? 200 : 201).json({ id: update ? Number(req.params.id) : result.insertId, name });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'اسم المجمع مستخدم.' });
      return next(error);
    }
  };
  router.post('/', requirePermission('families'), save(false));
  router.put('/:id', requirePermission('families'), save(true));
  return router;
}
