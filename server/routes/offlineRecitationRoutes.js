import express from 'express';
import { db } from '../db.js';
import { OFFLINE_RECITATION_CACHE_DAYS, isUuid } from '../../shared/offline-recitation.js';
import { registerDeviceTransaction } from '../services/recitationDeviceRegistration.js';

const allowedRoles = new Set(['supervisor', 'reciter', 'admin']);

const requireRecitationAccount = (req, res) => {
  if (allowedRoles.has(req.auth?.role)) return true;
  res.status(403).json({ message: 'العمل دون إنترنت متاح لحسابات التسميع فقط.' });
  return false;
};

export function createOfflineRecitationRouter({ getToday, prepareOfflineWindow }) {
  const router = express.Router();

  router.post('/bootstrap', async (req, res, next) => {
    const connection = await db().getConnection();
    try {
      if (!requireRecitationAccount(req, res)) return;
      const anchor = await registerDeviceTransaction(connection, {
        req,
        deviceId: req.body.deviceId,
        bootId: req.body.bootId,
        deviceEpochMs: req.body.deviceEpochMs,
        monotonicMs: req.body.monotonicMs,
      });
      const today = getToday();
      if (req.body.prepareFutureTasks !== false) await prepareOfflineWindow?.({
        connection,
        accountId: req.auth.id,
        role: req.auth.role,
        fromDate: today,
        cacheDays: OFFLINE_RECITATION_CACHE_DAYS,
      });
      const [students] = await connection.query(
        `SELECT students.id AS studentId, students.name AS studentName,
          students.committee_id AS committeeId, committees.name AS committeeName
         FROM students
         JOIN supervisor_committees ON supervisor_committees.committee_id = students.committee_id
           AND supervisor_committees.supervisor_id = ?
         LEFT JOIN committees ON committees.id = students.committee_id
         ORDER BY students.name`,
        [req.auth.id],
      );
      const studentIds = students.map((student) => Number(student.studentId));
      let plans = [];
      let tasks = [];
      if (studentIds.length) {
        const placeholders = studentIds.map(() => '?').join(',');
        [plans] = await connection.query(
          `SELECT id, student_id AS studentId, previous_plan_id AS previousPlanId,
            status, plan_version AS planVersion, track,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
            DATE_FORMAT(effective_from, '%Y-%m-%d') AS effectiveFrom,
            start_page AS startPage, start_surah AS startSurah, start_ayah AS startAyah,
            end_page AS endPage, end_surah AS endSurah, end_ayah AS endAyah,
            daily_pages AS dailyPages, link_pages AS linkPages, review_pages AS reviewPages,
            next_memorization_page AS nextMemorizationPage,
            next_memorization_surah AS nextMemorizationSurah,
            next_memorization_ayah AS nextMemorizationAyah,
            next_review_page AS nextReviewPage, schedule_days_json AS scheduleDays
           FROM student_quran_plans
           WHERE student_id IN (${placeholders}) AND status IN ('active','completed')`,
          studentIds,
        );
        [tasks] = await connection.query(
          `SELECT tasks.id, tasks.plan_id AS planId, tasks.student_id AS studentId,
            DATE_FORMAT(tasks.task_date, '%Y-%m-%d') AS taskDate,
            tasks.task_type AS taskType, tasks.track,
            tasks.from_page AS fromPage, tasks.to_page AS toPage, tasks.from_surah AS fromSurah,
            tasks.from_ayah AS fromAyah, tasks.to_surah AS toSurah, tasks.to_ayah AS toAyah,
            tasks.target_pages AS targetPages, tasks.actual_to_page AS actualToPage,
            tasks.actual_to_surah AS actualToSurah, tasks.actual_to_ayah AS actualToAyah,
            tasks.student_status AS studentStatus, tasks.teacher_completed AS teacherCompleted,
            tasks.warning_count AS warningCount, tasks.mistake_count AS mistakeCount,
            tasks.evaluation_score AS evaluationScore, tasks.evaluated_at AS evaluatedAt,
            plans.plan_version AS planVersion,
            qsf.name_arabic AS fromSurahName, qst.name_arabic AS toSurahName
           FROM student_quran_tasks tasks
           JOIN student_quran_plans plans ON plans.id = tasks.plan_id
           LEFT JOIN quran_surahs qsf ON qsf.surah_number = tasks.from_surah
           LEFT JOIN quran_surahs qst ON qst.surah_number = tasks.to_surah
           WHERE tasks.student_id IN (${placeholders})
             AND tasks.task_date BETWEEN DATE_SUB(?, INTERVAL 7 DAY) AND DATE_ADD(?, INTERVAL ? DAY)
           ORDER BY tasks.student_id, tasks.task_date, tasks.id`,
          [...studentIds, today, today, OFFLINE_RECITATION_CACHE_DAYS],
        );
      }
      res.json({
        deviceId: anchor.deviceId,
        timeAnchor: anchor,
        serverTime: new Date().toISOString(),
        timezone: 'Asia/Riyadh',
        cacheDays: OFFLINE_RECITATION_CACHE_DAYS,
        students,
        plans,
        tasks,
      });
    } catch (error) {
      next(error);
    } finally {
      connection.release();
    }
  });

  router.post('/status', async (req, res, next) => {
    try {
      if (!requireRecitationAccount(req, res)) return;
      const sessionIds = [...new Set((Array.isArray(req.body.sessionIds) ? req.body.sessionIds : [])
        .filter(isUuid).map((value) => String(value).toLowerCase()))].slice(0, 100);
      if (!sessionIds.length) return res.json({ results: [] });
      const placeholders = sessionIds.map(() => '?').join(',');
      const [rows] = await db().query(
        `SELECT session_id AS sessionId, status, rejection_code AS rejectionCode,
          rejection_message AS rejectionMessage, resolved_at AS resolvedAt
         FROM student_quran_recitation_submissions
         WHERE evaluator_id = ? AND session_id IN (${placeholders})`,
        [req.auth.id, ...sessionIds],
      );
      return res.json({ results: rows });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
