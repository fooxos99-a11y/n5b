import express from 'express';
import { db } from '../db.js';
import {
  isRecitationMode,
  loadStaffRecitationPreferences,
  saveStaffRecitationPreferences,
} from '../services/staffRecitationPreferences.js';

const preferenceKeys = Object.freeze([
  'memorizationMode',
  'masteryMode',
  'reviewMode',
  'linkMode',
]);

export function createStaffRecitationPreferencesRouter({ loadSettings }) {
  const router = express.Router();
  router.use((req, res, next) => (
    ['supervisor', 'reciter'].includes(req.auth?.role)
      ? next()
      : res.status(403).json({ message: 'إعدادات جلسات التسميع متاحة لصاحب الحساب فقط.' })
  ));

  router.get('/me', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      const settings = await loadSettings();
      res.json(await loadStaffRecitationPreferences(
        connection,
        req.auth.id,
        req.auth.role,
        settings,
      ));
    } catch (error) {
      next(error);
    } finally {
      connection.release();
    }
  });

  router.put('/me', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      if (preferenceKeys.some((key) => !isRecitationMode(req.body?.[key]))) {
        return res.status(422).json({ message: 'طريقة التسميع غير صحيحة.' });
      }
      const preferences = await saveStaffRecitationPreferences(connection, req.auth.id, req.body);
      res.json(preferences);
    } catch (error) {
      next(error);
    } finally {
      connection.release();
    }
  });

  return router;
}
