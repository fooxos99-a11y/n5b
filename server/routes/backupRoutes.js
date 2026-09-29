import express from 'express';
import {
  createDatabaseBackup,
  getBackupConfig,
  listDatabaseBackups,
  resolveBackupDownload,
  restoreDatabaseBackup,
} from '../services/databaseBackups.js';

export function createBackupRouter({ requireManager }) {
  const router = express.Router();
  router.use(requireManager);

  router.get('/', async (_req, res, next) => {
    try {
      res.json({ config: await getBackupConfig(), runs: await listDatabaseBackups() });
    } catch (error) { next(error); }
  });

  router.post('/', async (req, res, next) => {
    try {
      res.status(201).json(await createDatabaseBackup({ trigger: 'manual', actorName: req.auth?.name || 'المدير' }));
    } catch (error) { next(error); }
  });

  router.get('/:id/download', async (req, res, next) => {
    try {
      const backup = await resolveBackupDownload(req.params.id);
      if (!backup) return res.status(404).json({ message: 'ملف النسخة الاحتياطية غير موجود.' });
      res.download(backup.filePath, backup.fileName);
    } catch (error) { next(error); }
  });

  router.post('/:id/restore', async (req, res, next) => {
    try {
      res.json(await restoreDatabaseBackup(req.params.id, req.auth?.name || 'المدير'));
    } catch (error) { next(error); }
  });

  return router;
}
