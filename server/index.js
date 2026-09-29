import { planScheduleDates } from './services/planScheduleDates.js';
import { assertCommitteeNameAvailable, transferStudentCommittee } from './services/committeeMaintenance.js';
import { assertStudentIdentityAvailable } from './services/studentIdentity.js';
import { rememberResetGradeKeys } from './services/gradePointReset.js';
import { currentQuranPlanSql, canContinueQuranRevision } from './services/currentQuranPlan.js';
import { loadReviewCycle, saveReviewCycle, selectAuthorizedReview } from './services/quranReviewCycle.js';
import { parseReviewExecution, reviewRangeLabel } from '../shared/quran-review-cycle.js';
import { normalizeEventNotifications } from '../shared/event-notifications.js';
import { extendReviewEnd } from '../shared/quran-review-extension.js';
import { runCountedStatements, queryTaskGroups } from './services/queryResults.js';
import { createDashboardUndo } from './services/dashboardUndo.js';
import { createBufferedPdf, REPORT_PDF_COLORS } from './services/bufferedPdf.js';
import { sendWhatsAppResult } from './services/whatsAppResult.js';
import { getTaskSummary, formatReportFaces } from '../shared/report-faces.js';
import { loadStaffAttendanceReport } from './services/staffAttendanceReport.js';
import { practiceCompletionCount } from '../shared/practice-completion.js';
import { assertGradeAdjustmentAllowed, normalizeStudentGradeAdjustment } from './services/studentBalanceAdjustment.js';
import { normalizeWordMarkType, normalizeSelectedWordMarks, normalizeSelectedAyahMarks } from './services/recitationMarks.js';
import { persistTaskExecutionUpdates } from './services/taskExecutionUpdates.js';
function createCompactPdfWriter(doc, regularFont, text) {
  return (value, x, y, options = {}) => {
      const size = options.size || 10;
      doc.fillColor(options.color || text)
        .font(options.font || regularFont)
        .fontSize(size)
        .text(String(value ?? ''), x, y, {
          width: options.width,
          align: options.align || 'right',
          height: options.height ?? Math.max(size + 3, 8),
          ellipsis: true,
          lineBreak: false,
        });
    };
}

import { canTeacherSetRecitationAttendance, isRecitationAttendanceVisible } from '../shared/recitation-attendance-policy.js';
import { getDatesInRange } from './services/dateRanges.js';
import { studentVisibleToday, studentVisibleTasks } from '../shared/student-amount-visibility.js';
import { updateContinuedQuranPlan } from './services/continuedQuranPlan.js';
import { assertGradeDate } from './services/gradeDateBoundary.js';
import { sendWhatsAppOnce } from './services/whatsAppOnce.js';
import { assertAdministratorScope } from './services/administratorScope.js';
import { selectExactQuranLinkRanges } from './services/quranLinkRanges.js';
import { measureQuranFaces, quranRangeFacesSql, acceptedQuranExecutionSql } from './services/quranFaceMeasurement.js';
import { readQuranChapters, readQuranAyah, readQuranRange, readDescendingNextAyah } from './services/quranReferenceCache.js';
import { runRecitationSessionTransaction } from './services/recitationSessionTransaction.js';
import { buildRecitationSegmentDetails } from './services/recitationSegments.js';
import { loadRecitationDeliveryReceipts } from './services/recitationDeliveryReceipts.js';
import { buildGradingOverview, buildGradingSessionReport } from './services/gradingReports.js';
import { applyStudentPointDelta, syncStudentPointBalance, logStudentPointTransaction, roundPoints } from './services/studentPoints.js';
import { buildStudentPlanPoints } from './services/studentPlanPoints.js';
import { saveStudentAttendance } from './services/studentAttendance.js';
import { GRADE_POINT_REASONS, narrationGradeDedupeKey, syncGradePoints } from './services/gradePoints.js';
import { getReviewStartForDate, reviewPagesMatch } from './services/quranReviewSchedule.js';
import { pickReviewPagesByHizbs, splitPageRangesByHizb } from '../shared/quran-hizbs.js';
import { DEFAULT_PLAN_READING_FACES, MAX_PLAN_READING_FACES, PLAN_SAVE_MODES } from '../shared/quran-plan-options.js';
import { createGradingRouter } from './routes/gradingRoutes.js';
import { GRADING_POLICY_SETTING_KEY, parseGradingPolicy, scheduleDaysFromGradingPolicy } from '../shared/grading-policy.js';
import { canMarkRecitationFailed, RECITATION_FAILED_LABEL } from '../shared/recitation-fail.js';
import { notifyTeacherPointAdjustment } from './services/teacherPointNotification.js';
import { loadAdjacentQuranPosition, loadQuranPagePositions } from './services/quranTraversalIndex.js';
import { expireQuranTasks } from './services/expireQuranTasks.js';
import { requestDiagnostics, startRuntimeDiagnostics } from './services/requestDiagnostics.js';
import { publicErrorMessage } from './services/publicErrors.js';
import { createSharedPreparation } from './services/sharedPreparation.js';
import { loadStudentRecitationHistory } from './services/studentRecitationHistory.js';
import { createOverviewReportScope } from './services/overviewReportScope.js';
import { getStudentNextDayPreview, nameStudentPreviewTasks } from './services/studentNextDayPreview.js';
import { filterPlanMarksByLatestAttempt } from './services/studentPlanMarks.js';
import { notificationRouter, notificationManagementRouter } from './routes/notificationRoutes.js';
import cors from 'cors';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import express from 'express';
import { memorizedSegments } from './services/memorizedSegments.js';
import { loadStudentLevels } from './services/studentLevels.js';
import nodeFs from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import nodePath from 'node:path';
import QRCode from 'qrcode';
import {
  db,
  getDatabaseContext,
  initDatabase,
  runWithDatabase,
} from './db.js';
import { findComplexByRegistration, initPlatformDatabase, platformDb } from './platformDb.js';
import platformRouter from './platformRoutes.js';
import accountDeletionRouter from './routes/accountDeletionRoutes.js';
import callRouter from './routes/callRoutes.js';
import { createBackupRouter } from './routes/backupRoutes.js';
import { createStoreRouter } from './routes/storeRoutes.js';
import { createStudentNewsRouter } from './routes/studentNewsRoutes.js';
import { createStaffAttendanceRouter } from './routes/staffAttendanceRoutes.js';
import { createStaffRecitationPreferencesRouter } from './routes/staffRecitationPreferencesRoutes.js';
import { createOfflineRecitationRouter } from './routes/offlineRecitationRoutes.js';
import { createOfflineStudentRouter } from './routes/offlineStudentRoutes.js';
import tenantAuthRouter from './routes/tenantAuthRoutes.js';
import { removedFeaturesMiddleware } from './middleware/removedFeatures.js';
import { readLocalMushafFont, readLocalMushafPage } from './services/localMushaf.js';
import { findNextUnmemorizedPosition } from './services/quranMemorizationContinuity.js';
import { BUSINESS_DAY_START_TIME, getBusinessDateTimeParts as getSaudiDateTimeParts } from '../shared/business-date.js';
import { OFFLINE_RECITATION_MAX_BATCH } from '../shared/offline-recitation.js';
import { getRecitationStatusLabel } from '../shared/recitation-evaluation.js';
import {
  createIpRateLimiter,
  createApiRateLimiter,
  enforceContentLength,
  requireBearerHeader,
  securityHeaders,
} from './middleware/security.js';
import {
  createAuthenticateApiRequest,
  limitActiveAuthSessionLifetimes,
  revokeAuthSessionsForUser,
} from './services/authSessions.js';
import {
  cleanAdministratorDashboardPermissions,
  cleanDashboardPermissions,
  DASHBOARD_PERMISSION_KEYS,
  getSupervisorDashboardPermissions,
  hasOfflineRecitationAccountAccess,
  hasSupervisorDashboardPermission,
  permissionDenied,
  requirePermission,
} from './services/dashboardPermissions.js';
import { buildOverviewPdf } from './services/overviewPdf.js';
import {
  loadUsedLoginNumbers,
} from './services/loginNumbers.js';
import {
  buildArchiveExcel,
  buildArchivePdf,
  buildOverviewExcel,
  buildSupervisorExcel,
  buildSupervisorPdf,
  styleModernReportSheet,
} from './services/reportExportBuilders.js';
import {
  getWhatsAppTenantAuthPath,
  getWhatsAppTenantKey,
} from './services/whatsAppTenant.js';
import { getSiteConfig, siteKey } from './siteConfig.js';
import quranVerseLineLayout from './data/quranVerseLineLayout.js';
import { getInclusiveQcfPages } from './services/quranMushafWordLayout.js';
import { loadStaffRecitationPreferences } from './services/staffRecitationPreferences.js';
import {
  calculateWeeklyReviewDailyPages,
  getPlanExecutionLimit,
} from './services/quranPlanProgress.js';
import { formatQuranSelectionText } from '../shared/quranSelectionText.js';
import { runScheduledDatabaseBackup, createDatabaseBackup } from './services/databaseBackups.js';
import {
  claimRecitationSession,
  finalizeRecitationTask,
} from './services/offlineRecitation.js';

import {
  platformFeatureSettingKeys,
} from '../shared/platform-settings-catalog.js';
import { enforcePointsFeatureDependencies } from '../shared/points-feature-settings.js';
import { normalizeTeacherPointTypes } from '../shared/teacher-point-types.js';
import { normalizeFamilyRankingMode, rankFamilies } from '../shared/family-rankings.js';
import {
  MANUAL_FAIL_RATING_KEY,
  evaluateRecitationRow,
  loadGradingPolicy,
  loadGradingPolicyForDate,
  computeStudentsWeeklyGrades,
  weekStartOf,
  recomputeRecitationGroupGrade,
} from './services/grading.js';
import { compareQuranPositionInDirection, canStudentExecuteQuranTask, canStudentSetQuranTaskEnd, canTeacherExecuteQuranTask, getQuranTaskExecutionSource, hasStudentQuranExecution, normalizeQuranExecutionSource } from '../shared/quran-execution-policy.js';
import { normalizeOptionalPhone, normalizeOptionalIdentity } from '../shared/account-contact.js';
import { buildForwardQuranFaceRange } from '../shared/quran-face-range.js';
import {
  normalizeRecitationAmountDay,
} from '../shared/recitation-amount-day.js';

import {
  applyPlatformPolicies,
  readPlatformPoliciesFromRows,
} from './services/platformSettingPolicies.js';

const app = express();
const port = Number(process.env.API_PORT || 3002);
const siteConfig = getSiteConfig();
function currentSiteConfig() {
  const tenant = getDatabaseContext().tenant;
  if (tenant) {
    return {
      ...siteConfig,
      key: tenant.registrationNumber ? `tenant-${tenant.registrationNumber}` : siteConfig.key,
      registrationNumber: tenant.registrationNumber,
      complexName: tenant.name,
      whatsappUrl: siteConfig.whatsappUrl || '',
    };
  }
  return siteConfig;
}
const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_WEEKLY_HOLIDAY_DAYS = [5, 6];
const DEFAULT_RECITATION_SESSION_DAYS = [0, 1, 2, 3, 4];
const QURAN_DAILY_TASK_TYPES = new Set(['memorization', 'repeat', 'review', 'link']);
const QURAN_EXTRA_FORWARD_FACES = 50;
const QURAN_LINES_PER_PAGE = 15;
const qcfMushafPageCache = new Map();
const QURAN_PLAN_TRACKS = new Set(['memorization', 'mastery']);
const QURAN_PLAN_TRACK_LABELS = {
  memorization: 'حفظ',
  mastery: 'إتقان',
};
const quranVerseLineRows = quranVerseLineLayout.map(([key, startPage, startLine, endPage, endLine], index) => ({
  key,
  index,
  startPage: Number(startPage),
  startLine: Number(startLine),
  endPage: Number(endPage),
  endLine: Number(endLine),
}));

async function getQcfVersePageBoundary(verseKey) {
  const key = String(verseKey || '');
  if (!/^\d{1,3}:\d{1,3}$/.test(key)) return null;
  const localBoundary = quranVerseLineByKey.get(key);
  return localBoundary
    ? { fromPage: localBoundary.startPage, toPage: localBoundary.endPage }
    : null;
}

async function getQcfTaskPageNumbers(task) {
  const review = parseReviewExecution(task.reviewExecution);
  if (task.reviewExecution && !review) return [];
  if (review) {
    const ranges = await Promise.all(review.ranges.map(({ start, end }) => getQcfTaskPageNumbers({
      fromPage: start.page, fromSurah: start.surah, fromAyah: start.ayah, toPage: end.page, toSurah: end.surah, toAyah: end.ayah,
    })));
    return [...new Set(ranges.flat())];
  }
  const endSurah = Number(task.actualToSurah || task.toSurah || 0);
  const endAyah = Number(task.actualToAyah || task.toAyah || 0);
  const [fromBoundary, toBoundary] = await Promise.all([
    getQcfVersePageBoundary(`${Number(task.fromSurah || 0)}:${Number(task.fromAyah || 0)}`),
    getQcfVersePageBoundary(`${endSurah}:${endAyah}`),
  ]);
  return getInclusiveQcfPages(
    fromBoundary?.fromPage || Number(task.fromPage),
    toBoundary?.toPage || Number(task.actualToPage || task.toPage)
  );
}

async function getQcfMushafPage(pageNumber) {
  const page = Number(pageNumber || 0);
  if (!isValidQuranPageNumber(page)) return null;
  if (qcfMushafPageCache.has(page)) return qcfMushafPageCache.get(page);
  const request = readLocalMushafPage(page).catch((error) => {
    qcfMushafPageCache.delete(page);
    throw error;
  });
  qcfMushafPageCache.set(page, request);
  return request;
}

const quranVerseLineByKey = new Map(quranVerseLineRows.map((row) => [row.key, row]));
const FAMILY_EVALUATION_SCOPES = new Set(['all_supervisors', 'program_supervisor']);
const RESET_POINTS_CONFIRM_TEXT = 'إعادة تعيين النقاط';
const DELETE_PROGRAM_DATA_CONFIRM_TEXT = 'حذف جميع البيانات';
function getManagerLoginNumber() {
  const configuredLoginNumber = String(process.env.MANAGER_LOGIN_NUMBER || '').trim();
  if (configuredLoginNumber) return configuredLoginNumber;
  return process.env.NODE_ENV === 'production' ? '' : '1';
}

function getManagerName() {
  return String(process.env.MANAGER_NAME || 'المدير').trim() || 'المدير';
}

const LEGACY_HOMEPAGE_STATS_JSON = JSON.stringify([
  { value: 150, suffix: '+', label: 'نجاح المشاريع', description: 'مشاريع ومنجزات تم تنفيذها بكفاءة.' },
  { value: 100, suffix: '%', label: 'رضا المستفيدين', description: 'تجربة موثوقة ونتائج واضحة.' },
  { value: 300, suffix: '+', label: 'ساعات تطوير', description: 'عمل مستمر لصناعة حلول أفضل.' },
  { value: 75, suffix: '+', label: 'شراكات', description: 'أثر ممتد مع شركاء النجاح.' },
]);
let WhatsAppMessageMedia = null;
const whatsAppRuntimes = new Map();
function getWhatsAppRuntime() {
  const databaseName = getDatabaseContext().databaseName;
  if (!whatsAppRuntimes.has(databaseName)) {
    whatsAppRuntimes.set(databaseName, {
      key: getWhatsAppTenantKey(databaseName),
      client: null,
      initializingClient: null,
      starting: null,
      state: { ready: false, qr: '', status: 'idle', message: '' },
    });
  }
  return whatsAppRuntimes.get(databaseName);
}
const whatsAppState = new Proxy({}, {
  get(_target, property) {
    if (property === 'toJSON') return () => ({ ...getWhatsAppRuntime().state });
    return getWhatsAppRuntime().state[property];
  },
  set(_target, property, value) {
    getWhatsAppRuntime().state[property] = value;
    return true;
  },
  ownKeys() {
    return Reflect.ownKeys(getWhatsAppRuntime().state);
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  },
});
const WHATSAPP_LINK_REQUIRED_MESSAGE = 'يجب ربط الباركود قبل الإرسال.';
const WHATSAPP_LINKED_DEVICE_OFFLINE_CODE = 'WHATSAPP_LINKED_DEVICE_OFFLINE';
const WHATSAPP_LINKED_DEVICE_OFFLINE_MESSAGE = 'جهاز واتساب المرتبط غير متصل بالإنترنت. وصّل الجهاز بالإنترنت ثم حاول مرة أخرى.';
const WHATSAPP_INITIALIZATION_TIMEOUT_MS = Math.max(
  15_000,
  Number(process.env.WHATSAPP_INITIALIZATION_TIMEOUT_MS || 45_000),
);
const DEFAULT_WHATSAPP_AUTH_PATH = nodePath.join(os.homedir(), '.nukhab', 'wwebjs_auth');

function getWhatsAppAuthPath() {
  const basePath = process.env.WHATSAPP_AUTH_PATH || DEFAULT_WHATSAPP_AUTH_PATH;
  const defaultDatabase = process.env.MYSQL_DATABASE || `wajeh_${siteKey}`;
  const databaseName = getDatabaseContext().databaseName;
  return getWhatsAppTenantAuthPath({ basePath, databaseName, defaultDatabase });
}

const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
]);
String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .forEach((origin) => allowedOrigins.add(origin));
[
  process.env.PUBLIC_APP_URL,
  process.env.PLATFORM_PUBLIC_APP_URL,
].filter(Boolean).forEach((value) => {
  try {
    allowedOrigins.add(new URL(value).origin);
  } catch {
    // Invalid optional origins are ignored; explicit ALLOWED_ORIGINS remains authoritative.
  }
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(requestDiagnostics);
startRuntimeDiagnostics();
app.use(securityHeaders);
app.use(cors((req, callback) => {
  const requestOrigin = `${req.protocol}://${req.get('host')}`;
  callback(null, {
    credentials: true,
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-RateLimit-Scope', 'X-Dashboard-Undo'],
    origin(origin, originCallback) {
      originCallback(null, !origin || origin === requestOrigin || allowedOrigins.has(origin));
    },
  });
}));
app.use('/api', createApiRateLimiter());
app.use(
  '/api/registration/public',
  createIpRateLimiter({
    keyPrefix: 'public-registration',
    windowMs: 10 * 60 * 1000,
    maxRequests: 20,
  }),
);
app.use(
  '/api/whatsapp/send',
  requireBearerHeader,
  enforceContentLength(20 * 1024 * 1024),
  express.json({ limit: '20mb' }),
);
app.use('/api/student-news/manage', enforceContentLength(16 * 1024 * 1024), express.json({ limit: '16mb' }));
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
  req.body = req.body || {};
  next();
});

const sendQuranFont = async (res, fileName) => {
  const font = await readLocalMushafFont(fileName);
  if (!font) return res.status(404).end();
  res.set({
    'Content-Type': 'font/woff2',
    'Content-Length': String(font.length),
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  res.send(font);
};

app.get('/api/quran-fonts/hafs/v2/page/:page/font.woff2', async (req, res, next) => {
  try {
    const page = Number(req.params.page || 0);
    if (!isValidQuranPageNumber(page)) return res.status(404).end();
    await sendQuranFont(res, `p${page}.woff2`);
  } catch (error) {
    next(error);
  }
});

app.get('/api/quran-fonts/hafs/uthmanic/font.woff2', async (_req, res, next) => {
  try {
    await sendQuranFont(res, 'uthmanic-hafs.woff2');
  } catch (error) {
    next(error);
  }
});

async function hasSupervisorStudentPlanAccess(req, studentId = null) {
  if (req.auth?.role !== 'supervisor' || !req.auth.id) return false;
  if (!studentId) return true;
  const [[row]] = await db().query(
    `
    SELECT 1 AS allowed
    FROM students s
    JOIN supervisor_committees sc
      ON sc.committee_id = s.committee_id
      AND sc.supervisor_id = ?
    WHERE s.id = ?
    LIMIT 1
    `,
    [req.auth.id, studentId]
  );
  return Boolean(row);
}

function requireStudentPlanAccess(req, res, next) {
  if (req.auth?.role === 'manager') return next();
  if (req.auth?.role === 'admin') {
    return hasSupervisorDashboardPermission(req.auth.id, 'studentPlans')
      .then((allowed) => allowed ? next() : permissionDenied(res))
      .catch(next);
  }
  hasSupervisorStudentPlanAccess(req)
    .then((allowed) => allowed ? next() : permissionDenied(res))
    .catch(next);
}

/** Quran reference data is also needed to record track-session segments in the grades section. */
function requireQuranReferenceAccess(req, res, next) {
  if (req.auth?.role === 'admin') {
    return hasSupervisorDashboardPermission(req.auth.id, ['studentPlans', 'grades'])
      .then((allowed) => allowed ? next() : permissionDenied(res))
      .catch(next);
  }
  return requireStudentPlanAccess(req, res, next);
}

function requireReportsOrOwnCommittee(req, res, next) {
  if (req.auth?.role === 'supervisor') return next();
  return requirePermission('reports')(req, res, next);
}

function requireManagementReportAccess(req, res, next) {
  if (req.auth?.role === 'supervisor') {
    return res.status(403).json({ message: 'هذا التقرير متاح للإدارة فقط.' });
  }
  return requirePermission('reports')(req, res, next);
}

function requireNarrationAccess(req, res, next) {
  if (req.auth?.role === 'manager') return next();
  if (req.auth?.role === 'admin') {
    return hasSupervisorDashboardPermission(req.auth.id, 'narrationDay')
      .then((allowed) => allowed ? next() : permissionDenied(res))
      .catch(next);
  }
  return permissionDenied(res);
}

async function canReadStudentQuranToday(req, studentId) {
  if (req.auth?.role === 'student') return Number(req.auth.id) === Number(studentId);
  if (req.auth?.role === 'manager') return true;
  if (req.auth?.role === 'admin') {
    return hasSupervisorDashboardPermission(req.auth.id, ['studentPlans', 'students']);
  }
  if (req.auth?.role === 'supervisor') return hasSupervisorStudentPlanAccess(req, studentId);
  return false;
}

const publicApiRules = [
  ['GET', /^\/native-update$/],
  ['GET', /^\/health$/],
  ['GET', /^\/site-config$/],
  ['POST', /^\/auth\/login$/],
  ['GET', /^\/public-settings$/],
  ['GET', /^\/registration\/public$/],
  ['POST', /^\/registration\/public$/],
  ['GET', /^\/homepage-stats$/],
  ['GET', /^\/committees$/],
  ['GET', /^\/rankings\/(?:families|students)$/],
];

function isPublicApiRequest(req) {
  const path = req.path.replace(/^\/api/, '');
  return publicApiRules.some(([method, pattern]) => method === req.method && pattern.test(path));
}

const authenticateApiRequest = createAuthenticateApiRequest({ isPublicApiRequest });

/** Match ordered API rules so specific permissions take precedence over broad prefixes. */
function getDashboardPermissionKeysForRequest(req) {
  const path = req.path.replace(/^\/api/, '');
  const method = req.method;
  const rules = [
    [path === '/settings', ['settings']],
    [path === '/grading/policy' && method !== 'GET', ['settings']],
    [path === '/grading/policy', ['settings', 'grades']],
    [path.startsWith('/account-deletion/requests'), ['settings']],
    [path.startsWith('/grading'), ['grades']],
    [path === '/student-news/manage' || path === '/student-news/audience', ['settings']],
    [path.startsWith('/staff-attendance'), ['staffAttendance']],
    [path.startsWith('/recitation-preferences'), ['quranEvaluation']],
    [path.startsWith('/backups'), ['settings']],
    [path.startsWith('/store'), ['store']],
    [path.startsWith('/registration-requests'), ['registrationRequests']],
    [path.startsWith('/notification-management'), ['notifications']],
    [path.startsWith('/whatsapp/'), ['whatsappSend']],
    [/^\/students\/\d+\/points\/award$/.test(path), ['students']],
    [path.startsWith('/student-plans'), ['studentPlans']],
    [path === '/quran/chapters' || path === '/quran/ayahs', ['studentPlans', 'grades']],
    [path.startsWith('/quran'), ['studentPlans']],
    [/^\/supervisors\/\d+\/quran-evaluation/.test(path), ['quranEvaluation']],
    [/^\/students\/\d+\/(?:attendance|absence)$/.test(path), ['manualAttendance']],
    [/^\/supervisors\/\d+\/(?:attendance|absence)$/.test(path), ['manualAttendance']],
    [/^\/reports\/(?:students|supervisors)$/.test(path), ['reports', 'manualAttendance']],
    [path.startsWith('/reports/'), ['reports']],
    [path.startsWith('/calls'), ['calls']],
    [path.startsWith('/narration-events'), ['narrationDay']],
    [path === '/students' && method === 'GET', ['students', 'reports', 'whatsappSend', 'manualAttendance']],
    [path.startsWith('/students'), ['students']],
    [path === '/supervisors' && method === 'GET', ['supervisors', 'whatsappSend']],
    [path.startsWith('/supervisors'), ['supervisors']],
    [path.startsWith('/administrators'), ['administrators']],
    [path.startsWith('/families'), ['families']]
  ];
  return rules.find(([matches]) => matches)?.[1] || [];
}

async function canAccessDashboardApi(req) {
  if (!['supervisor', 'admin', 'reciter'].includes(req.auth?.role)) return false;
  const keys = getDashboardPermissionKeysForRequest(req);
  return hasSupervisorDashboardPermission(req.auth.id, keys);
}

async function authorizeApiRequest(req, res, next) {
  // Reciter accounts were removed: an old reciter session has no access.
  if (req.auth?.role === 'reciter') return res.status(401).json({ message: 'سجل الدخول أولاً.' });
  if (!req.auth || req.auth.role === 'manager') return next();
  try {
    const path = req.path.replace(/^\/api/, '');
    if (req.auth.role === 'student' && req.method === 'GET' && path === '/student-news') return next();
    const id = String(req.auth.id || '');
    const { sharedGet, sharedPost } = getSharedApiAccess(req, path);
    const ownStudent = req.auth.role === 'student' && new RegExp(`^/students/${id}(?:/|$)`).test(path);
    const ownSupervisor = req.auth.role === 'supervisor' && new RegExp(`^/supervisors/${id}(?:/|$)`).test(path);
    const attendanceStatus = req.method === 'GET' && path === '/attendance/status';
    const ownAccountDeletion = getOwnAccountDeletionAccess(req, path);
    const { supervisorStudentPlans, supervisorTeacherAttendance, supervisorOwnReports, supervisorTeacherPointsAccess, supervisorTeacherPointsReport } = getSupervisorApiAccess(req, path);
    const accountCallsAccess = ['student', 'supervisor'].includes(req.auth.role) && path.startsWith('/calls');
    const { studentStoreAccess, studentOfflineAccess } = getStudentFeatureApiAccess(req, path);
    const accountNotificationsAccess = /^\/notifications(?:\/|$)/.test(path) && ['student', 'supervisor', 'admin', 'reciter'].includes(req.auth.role);
    const studentNotificationsAccess = req.auth.role === 'student' && path.startsWith('/student-notifications');
    const ownStaffAttendanceAccess = ['supervisor', 'reciter'].includes(req.auth.role) && path.startsWith('/staff-attendance');
    const ownRecitationPreferencesAccess = ['supervisor', 'reciter'].includes(req.auth.role)
      && path.startsWith('/recitation-preferences');
    const ownOfflineRecitationAccess = hasOfflineRecitationAccountAccess(req.auth.role, path);
    if (accountNotificationsAccess || sharedGet || sharedPost || ownStudent || ownSupervisor || attendanceStatus || ownAccountDeletion || supervisorStudentPlans || supervisorTeacherAttendance || supervisorOwnReports || supervisorTeacherPointsAccess || supervisorTeacherPointsReport || accountCallsAccess || studentStoreAccess || studentOfflineAccess || studentNotificationsAccess || ownStaffAttendanceAccess || ownRecitationPreferencesAccess || ownOfflineRecitationAccess) return next();
    if (await canAccessDashboardApi(req)) return next();
    return res.status(403).json({ message: 'لا يمكنك الوصول إلى بيانات حساب آخر.' });
  } catch (error) {
    return next(error);
  }
}

/** Limit self-service account deletion to its supported methods and account roles. */
function getOwnAccountDeletionAccess(req, path) {
  return ['student', 'supervisor', 'admin', 'manager'].includes(req.auth.role) && (
    (req.method === 'GET' && path === '/account-deletion/me')
    || (req.method === 'POST' && path === '/account-deletion')
    || (req.method === 'DELETE' && path === '/account-deletion')
  );
}

function getStudentFeatureApiAccess(req, path) {
  const studentStoreAccess = req.auth.role === 'student' && (
    (req.method === 'GET' && path === '/store/products')
    || (req.method === 'POST' && path === '/store/purchase')
  );
  const studentOfflineAccess = req.auth.role === 'student' && path.startsWith('/offline-student');
  return { studentStoreAccess, studentOfflineAccess };
}

function getSupervisorApiAccess(req, path) {
  const supervisorStudentPlans = req.auth.role === 'supervisor' && (path.startsWith('/student-plans') || path.startsWith('/quran'));
  const supervisorTeacherAttendance = req.auth.role === 'supervisor'
    && req.method === 'POST'
    && /^\/students\/\d+\/attendance$/.test(path);
  const supervisorOwnReports = req.auth.role === 'supervisor'
    && req.method === 'GET'
    && /^\/reports\/(?:committees|students|overview|progress|grading-sessions|recitation-sessions|student-recitation-history|student-saved|recitation-session-dates)(?:\/export)?$/.test(path);
  const supervisorTeacherPointsAccess = req.auth.role === 'supervisor'
    && path.startsWith('/teacher-points');
  const supervisorTeacherPointsReport = req.auth.role === 'supervisor'
    && req.method === 'GET'
    && path === '/reports/teacher-points';
  return { supervisorStudentPlans, supervisorTeacherAttendance, supervisorOwnReports, supervisorTeacherPointsAccess, supervisorTeacherPointsReport };
}

function getSharedApiAccess(req, path) {
  const sharedGet = req.method === 'GET' && (
    path === '/committees' ||
    path.startsWith('/rankings/') ||
    path === '/dashboard-permissions/me' ||
    path === '/dashboard-bootstrap'
  );
  const sharedPost = req.method === 'POST' && (
    path === '/auth/logout'
  );
  return { sharedGet, sharedPost };
}

function sanitizeActivityDetails(body = {}) {
  const hiddenKeys = new Set([
    'attachment',
    'attachmentData',
    'contentValue',
    'data',
    'password',
    'subscription',
    'subscriptionJson',
  ]);

  return Object.fromEntries(
    Object.entries(body || {}).map(([key, value]) => {
      if (hiddenKeys.has(key)) return [key, '[بيانات مخفية]'];
      if (key === 'permissions' && Array.isArray(value)) return [key, value];
      if (Array.isArray(value)) return [key, `[عدد العناصر: ${value.length}]`];
      if (value && typeof value === 'object') return [key, '[بيانات مركبة]'];
      if (typeof value === 'string' && value.length > 300) return [key, `${value.slice(0, 300)}...`];
      return [key, value];
    })
  );
}

const activityDetailLabels = {
  points: 'النقاط',
  reason: 'السبب',
  date: 'التاريخ',
  status: 'الحالة',
  name: 'الاسم',
  title: 'العنوان',
  message: 'نص الرسالة',
  body: 'نص الإشعار',
  role: 'الفئة',
  recipientType: 'نوع المستلمين',
  recipientIds: 'المستلمون',
  studentIds: 'الطلاب',
  supervisorIds: 'المعلمون',
  studentId: 'الطالب',
  supervisorId: 'المعلم',
  committeeId: 'الحلقة',
  familyId: 'الحلقة',
  itemId: 'البند',
  maxPoints: 'نقاط البند',
  loginNumber: 'رقم الدخول',
  guardianPhone: 'رقم الجوال',
  phone: 'رقم الجوال',
  jobTitle: 'المسمى',
  maxSupervisorStudentPoints: 'حد إضافة نقاط الطالب',
  maxSupervisorDeductionPoints: 'حد الخصم من الطالب',
  teacherManualPointsEnabled: 'السماح للمعلم بالإضافة والخصم',
  teacherManualPointsTermLimit: 'حد المعلم في الفصل',
  teacherPointTypes: 'أنواع إضافة وخصم المعلم',
  familyPointsAddToStudents: 'إضافة نقاط الحلقة للطلاب',
  familyPointsAddToAbsentStudents: 'إضافة نقاط الحلقة للغائبين',
  studentPointsAddToFamily: 'إضافة نقاط الطالب للحلقة',
  familyEvaluationScope: 'نطاق تقييم الحلقات',
  rankingsVisible: 'إظهار صفحات الترتيب',
  studentRankingsVisible: 'إظهار ترتيب الطلاب',
  familyRankingsVisible: 'إظهار ترتيب الحلقات',
  rankingPointsVisible: 'إظهار نقاط الترتيب',
  attendanceManualEnabled: 'تفعيل التحضير اليدوي',
  hideStudentMemorizationAmount: 'إخفاء الحفظ والإتقان',
  hideStudentReviewAmount: 'إخفاء المراجعة',
  hideStudentLinkAmount: 'إخفاء الربط',
  hideStudentAmounts: 'إخفاء المقدار عن الطلاب',
  studentTaskAmountEditable: 'السماح للطالب بتقليل مقدار حفظ اليوم',
  studentReviewAmountEditable: 'السماح للطالب بتعديل مقدار المراجعة',
  studentLinkAmountEditable: 'السماح للطالب بتعديل مقدار الربط',
  reviewExecutionSource: 'مصدر تنفيذ المراجعة',
  linkExecutionSource: 'مصدر تنفيذ الربط',
  allowRepeatCountEditing: 'السماح للطالب بتعديل عدد التكرارات',
  memorizationListeningCount: 'عدد مرات سماع الحفظ',
  masteryListeningCount: 'عدد مرات سماع الإتقان',
  allowListeningCountEditing: 'السماح للطالب بتعديل عدد مرات السماع',
};

const activityPermissionLabels = {
  manualAttendance: 'التحضير',
  staffAttendance: 'تحضير المعلمين والإدارة',
  registrationRequests: 'طلبات التسجيل',
  students: 'الطلاب',
  studentPlans: 'خطط الطلاب',
  narrationDay: 'يوم السرد',
  calls: 'المكالمات',
  quranEvaluation: 'جلسات التسميع',
  families: 'الحلقات',
  supervisors: 'المعلمون',
  administrators: 'الإداريون',
  reports: 'التقارير',
  whatsappSend: 'الإرسال عبر الواتس',
  settings: 'الإعدادات',
  store: 'المتجر',
};

function formatActivityValue(key, value) {
  if (key === 'permissions' && Array.isArray(value)) {
    if (value.length === 0) return 'بدون صلاحيات';
    return value.map((permission) => activityPermissionLabels[permission] || permission).join('، ');
  }
  if (Array.isArray(value)) return value.length ? value.join('، ') : 'لا يوجد';
  if (value && typeof value === 'object') return '[بيانات مركبة]';
  return value;
}

function translateActivityDetails(details = {}) {
  const body = details?.body || {};
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [activityDetailLabels[key] || key, formatActivityValue(key, value)])
  );
}

function describeActivity(req) {
  const path = req.path;
  const method = req.method;
  const _resolveRules = () => {
    if (method === 'DELETE') {
      return 'حذف إداري';
    }
    if (method === 'PUT') {
      return 'تعديل إداري';
    }
    return 'إضافة إداري';
  };
  const _resolveRules3 = () => {
    if (method === 'DELETE') {
      return 'حذف حلقة';
    }
    if (method === 'PUT') {
      return 'تعديل حلقة';
    }
    return 'إضافة حلقة';
  };
  const _resolveRules4 = () => {
    if (method === 'DELETE') {
      return 'حذف معلم';
    }
    if (method === 'PUT') {
      return 'تعديل معلم';
    }
    return 'إضافة معلم';
  };
  const _resolveRules5 = () => {
    if (method === 'DELETE') {
      return 'حذف طالب';
    }
    if (method === 'PUT') {
      return 'تعديل طالب';
    }
    return 'إضافة طالب';
  };
  const rules = [
    [/\/dashboard-permissions\/\d+$/, 'تعديل صلاحيات معلم', 'supervisor'],
    [/\/students\/\d+\/attendance$/, 'تسجيل حضور طالب', 'student'],
    [/\/students\/\d+\/absence$/, 'تسجيل غياب طالب', 'student'],
    [/\/students\/\d+\/points\/award$/, 'إضافة نقاط لطالب', 'student'],
    [/\/teacher-points\/adjustments$/, 'إضافة أو خصم نقاط طالب من المعلم', 'student'],
    [/\/supervisors\/\d+\/attendance$/, 'تسجيل حضور معلم', 'supervisor'],
    [/\/supervisors\/\d+\/absence$/, 'تسجيل غياب معلم', 'supervisor'],
    [/\/whatsapp\/send$/, 'إرسال رسائل واتساب', 'whatsapp'],
    [/\/whatsapp\/disconnect$/, 'إلغاء ربط واتساب', 'whatsapp'],
    [/\/settings$/, 'تعديل الإعدادات', 'settings'],
    [/\/settings\/reset-points$/, 'تصفير جميع النقاط', 'settings'],
    [/\/settings\/end-term$/, 'إنهاء الفصل وحفظ نسخة احتياطية', 'settings'],
    [/\/settings\/delete-program-data$/, 'حذف جميع البيانات', 'settings'],
    [/\/students\/bulk$/, 'إضافة طلاب جماعياً', 'student'],
    [/\/students\/\d+\/committee$/, 'نقل طالب بين الحلقات', 'student'],
    [/\/homepage-stats$/, 'تعديل إحصاءات الواجهة', 'settings'],
    [/\/administrators/, _resolveRules(), 'administrator'],
    [/\/families/, _resolveRules3(), 'family'],
    [/\/supervisors/, _resolveRules4(), 'supervisor'],
    [/\/students/, _resolveRules5(), 'student'],
  ];
  const matched = rules.find(([pattern]) => pattern.test(path));
  if (!matched) return null;
  const entityId = /\/(\d+)(?:\/|$)/.exec(path)?.[1] || null;

  return {
    action: matched[1],
    entityType: matched[2],
    entityId,
  };
}

async function resolveActivityTarget(req, activity) {
  const path = req.path.replace(/^\/api/, '');
  const queries = [];
  const studentPath = /\/students\/(\d+)(?:\/|$)/.exec(path);
  const familyPath = /\/families\/(\d+)(?:\/|$)/.exec(path);
  const supervisorPath = /\/supervisors\/(\d+)(?:\/|$)/.exec(path);
  const administratorPath = /\/administrators\/(\d+)(?:\/|$)/.exec(path);
  const permissionPath = /\/dashboard-permissions\/(\d+)$/.exec(path);

  if (studentPath && activity.entityType === 'student') queries.push(['الطالب', 'SELECT name FROM students WHERE id = ? LIMIT 1', studentPath[1]]);
  else if (familyPath && activity.entityType === 'family') queries.push(['الحلقة', 'SELECT name FROM committees WHERE id = ? LIMIT 1', familyPath[1]]);
  else if (supervisorPath && activity.entityType === 'supervisor') queries.push(['المعلم', 'SELECT name FROM supervisors WHERE id = ? LIMIT 1', supervisorPath[1]]);
  else if (administratorPath && activity.entityType === 'administrator') queries.push(['الإداري', 'SELECT name FROM supervisors WHERE id = ? LIMIT 1', administratorPath[1]]);
  else if (permissionPath) queries.push(['المعلم', 'SELECT name FROM supervisors WHERE id = ? LIMIT 1', permissionPath[1]]);

  if (!queries.length) return null;
  const [label, sql, id] = queries[0];
  const [[row]] = await db().query(sql, [id]);
  return row?.name ? `${label}: ${row.name}` : `${label} رقم ${id}`;
}

function shouldSkipActivityLog(req) {
  if (req.method === 'GET') return true;
  if (!req.path.startsWith('/api/')) return true;
  if (req.path.startsWith('/api/activity-logs')) return true;
  if (req.path.startsWith('/api/auth/')) return true;
  return false;
}

async function recordActivity({
  actorRole = 'system',
  actorId = null,
  actorName = 'النظام',
  action,
  entityType = null,
  entityId = null,
  details = null,
}) {
  const [[setting]] = await db().query(
    'SELECT setting_value AS value FROM app_settings WHERE setting_key = ? LIMIT 1',
    ['activityLogEnabled']
  );
  if (setting?.value === 'false') return;

  await db().query(
    `
    INSERT INTO activity_logs (actor_role, actor_id, actor_name, action, entity_type, entity_id, details_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [actorRole, actorId, actorName, action, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}

function activityLogMiddleware(req, res, next) {
  if (shouldSkipActivityLog(req)) {
    next();
    return;
  }

  res.on('finish', async () => {
    if (res.statusCode >= 400) return;
    if (req.activitySkip) return;
    try {
      const role = req.auth?.role || 'system';
      const actorId = req.auth?.id || null;
      const actorName = req.auth?.name || (role === 'manager' ? 'المدير' : 'النظام');
      const activity = describeActivity(req);
      if (!activity) return;
      const targetName = await resolveActivityTarget(req, activity);
      const details = {
        body: {
          ...(targetName ? { المستهدف: targetName } : {}),
          ...translateActivityDetails({ body: sanitizeActivityDetails(req.body) }),
        },
      };

      await recordActivity({
        actorRole: role,
        actorId,
        actorName,
        action: activity.action,
        entityType: activity.entityType,
        entityId: activity.entityId,
        details,
      });
    } catch (error) {
      console.error('Activity log failed:', error.message);
    }
  });

  next();
}

app.use('/api/platform', platformRouter);
app.use('/api', async (req, res, next) => {
  try {
    if (req.path === '/health') return next();
    const requestedRegistrationNumber = String(
      req.body?.registrationNumber
      || req.get('x-registration-number')
      || req.query?.registrationNumber
      || '',
    ).trim();
    const configuredRegistrationNumber = String(siteConfig.registrationNumber || '').trim();
    const registrationNumber = requestedRegistrationNumber || configuredRegistrationNumber;
    if (!requestedRegistrationNumber && !/^\d{2,12}$/.test(configuredRegistrationNumber)) {
      const standaloneDatabaseName = process.env.MYSQL_DATABASE || `wajeh_${siteConfig.key}`;
      await initDatabase(standaloneDatabaseName);
      return runWithDatabase(standaloneDatabaseName, {
        tenant: {
          registrationNumber: '',
          name: siteConfig.name,
          databaseName: standaloneDatabaseName,
        },
      }, () => next());
    }
    const complex = await findComplexByRegistration(registrationNumber);
    if (complex?.status !== 'active' || !complex.databaseName) {
      return res.status(404).json({ message: 'المجمع غير موجود أو غير مفعّل.' });
    }
    await initDatabase(complex.databaseName);
    return runWithDatabase(complex.databaseName, {
      tenant: {
        registrationNumber: complex.registrationNumber,
        name: complex.name,
        databaseName: complex.databaseName,
      },
    }, () => next());
  } catch (error) {
    return next(error);
  }
});
const dashboardUndo = createDashboardUndo({ db, databaseName: () => getDatabaseContext().databaseName, hasPermission: hasSupervisorDashboardPermission });
app.use('/api', authenticateApiRequest);
app.use('/api/dashboard-undo', dashboardUndo.router);
app.use('/api', authorizeApiRequest);
app.use('/api', removedFeaturesMiddleware);
app.use(dashboardUndo.capture);
app.use(activityLogMiddleware);

function normalizeWhatsAppPhone(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('966')) return digits;
  if (digits.startsWith('0')) return `966${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith('5')) return `966${digits}`;
  return digits;
}

function fillWhatsAppTemplate(template, person = {}) {
  const replacements = {
    '{name}': person.name || '',
    '{student}': person.name || '',
    '{teacher}': person.name || '',
    '{phone}': person.guardianPhone || person.phone || '',
    '{login}': person.loginNumber || '',
    '{nationalId}': person.nationalId || '',
    '{age}': person.age || '',
    '{committee}': person.committeeName || '',
    '{committeeName}': person.committeeName || '',
    '{family}': person.committeeName || '',
    '{juz}': person.juzLabel || person.juz || '',
    '{part}': person.juzLabel || person.juz || '',
    '{date}': person.date || new Intl.DateTimeFormat('ar-SA', { timeZone: 'Asia/Riyadh' }).format(new Date()),
    '{tasks}': person.tasks || '',
    '{eventName}': person.eventName || '',
    '{fromDate}': person.fromDate || '',
    '{toDate}': person.toDate || '',
    '{score}': person.score ?? '',
    '{rating}': person.rating || '',
  };

  return Object.entries(replacements).reduce(
    (message, [token, value]) => message.replaceAll(token, value),
    template
  );
}

async function ensureWhatsAppClient() {
  const runtime = getWhatsAppRuntime();
  if (runtime.client) return runtime.client;
  if (runtime.starting) return runtime.starting;

  runtime.starting = (async () => {
    try {
      const module = await import('whatsapp-web.js');
      const { Client, LocalAuth, MessageMedia } = module.default || module;
      WhatsAppMessageMedia = MessageMedia;
      whatsAppState.status = 'starting';
      whatsAppState.message = 'جاري تشغيل واتساب.';

      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: runtime.key,
          dataPath: getWhatsAppAuthPath(),
        }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        },
      });
      runtime.initializingClient = client;

      client.on('qr', async (qr) => {
        if (runtime.initializingClient !== client && runtime.client !== client) return;
        runtime.state.ready = false;
        runtime.state.qr = await QRCode.toDataURL(qr);
        runtime.state.status = 'qr';
        runtime.state.message = 'امسح الباركود من تطبيق واتساب.';
      });

      client.on('ready', () => {
        if (runtime.initializingClient !== client && runtime.client !== client) return;
        runtime.state.ready = true;
        runtime.state.qr = '';
        runtime.state.status = 'ready';
        runtime.state.message = 'واتساب متصل.';
      });

      client.on('disconnected', () => {
        if (runtime.initializingClient !== client && runtime.client !== client) return;
        runtime.state.ready = false;
        runtime.state.status = 'disconnected';
        runtime.state.message = 'تم فصل واتساب.';
        runtime.client = null;
        runtime.initializingClient = null;
        runtime.starting = null;
      });

      client.on('auth_failure', async () => {
        if (runtime.initializingClient !== client && runtime.client !== client) return;
        runtime.state.ready = false;
        runtime.state.qr = '';
        runtime.state.status = 'auth_failure';
        runtime.state.message = 'تعذر توثيق واتساب. أنشئ باركودًا جديدًا.';
        runtime.client = null;
        runtime.initializingClient = null;
        runtime.starting = null;
        await client.destroy().catch(() => {});
      });

      let initializationTimer;
      await Promise.race([
        client.initialize(),
        new Promise((_, reject) => {
          initializationTimer = setTimeout(() => {
            const timeoutError = new Error('استغرق تجهيز باركود واتساب وقتًا أطول من المتوقع. أعد المحاولة.');
            timeoutError.code = 'WHATSAPP_INITIALIZATION_TIMEOUT';
            reject(timeoutError);
          }, WHATSAPP_INITIALIZATION_TIMEOUT_MS);
          initializationTimer.unref?.();
        }),
      ]).finally(() => clearTimeout(initializationTimer));
      runtime.client = client;
      runtime.initializingClient = null;
      return client;
    } catch (error) {
      runtime.state.ready = false;
      runtime.state.status = 'error';
      runtime.state.message = error.message;
      runtime.client = null;
      const initializingClient = runtime.initializingClient;
      runtime.initializingClient = null;
      runtime.starting = null;
      await initializingClient?.destroy().catch(() => {});
      return null;
    } finally {
      runtime.starting = null;
    }
  })();

  return runtime.starting;
}

async function refreshWhatsAppState({ waitMs = 0 } = {}) {
  const client = await ensureWhatsAppClient();
  if (!client) return whatsAppState;

  const startedAt = Date.now();
  let lastClientState;
  let stateError;
  do {
    try {
      lastClientState = await client.getState();
      stateError = null;
    } catch (error) {
      lastClientState = null;
      stateError = error;
    }
    if (lastClientState === 'CONNECTED') {
      whatsAppState.ready = true;
      whatsAppState.qr = '';
      whatsAppState.status = 'ready';
      whatsAppState.message = 'واتساب متصل.';
      return whatsAppState;
    }
    if (!waitMs) break;
    await wait(500);
  } while (Date.now() - startedAt < waitMs);

  updateDisconnectedWhatsAppState(lastClientState, stateError);
  return whatsAppState;
}

/** Update connection diagnostics without overwriting a pending QR pairing state. */
function updateDisconnectedWhatsAppState(lastClientState, stateError) {
  if (!whatsAppState.qr && whatsAppState.status !== 'qr') {
    whatsAppState.ready = false;
    if ((lastClientState && lastClientState !== 'CONNECTED') || isWhatsAppNetworkError(stateError)) {
      whatsAppState.status = 'disconnected';
      whatsAppState.message = WHATSAPP_LINKED_DEVICE_OFFLINE_MESSAGE;
    } else {
      whatsAppState.status = whatsAppState.status === 'starting' ? 'starting' : 'error';
      whatsAppState.message = 'تعذر التحقق من اتصال واتساب حالياً.';
    }
  }
}

function whatsAppDeliveryError(message, statusCode = 502, code = null) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function markWhatsAppLinkedDeviceOffline() {
  whatsAppState.ready = false;
  whatsAppState.status = 'disconnected';
  whatsAppState.message = WHATSAPP_LINKED_DEVICE_OFFLINE_MESSAGE;
}

function isWhatsAppNetworkError(error) {
  return /failed to fetch|network|disconnected|not connected|err_(?:internet|network|connection)/i.test(
    String(error?.message || error || '')
  );
}

async function normalizeWhatsAppOperationError(error, fallbackMessage) {
  const runtime = getWhatsAppRuntime();
  let clientState = null;
  let stateError = null;
  try {
    clientState = await runtime.client?.getState();
  } catch (currentStateError) {
    stateError = currentStateError;
  }
  if (
    (clientState && clientState !== 'CONNECTED')
    || isWhatsAppNetworkError(error)
    || isWhatsAppNetworkError(stateError)
  ) {
    markWhatsAppLinkedDeviceOffline();
    return whatsAppDeliveryError(
      WHATSAPP_LINKED_DEVICE_OFFLINE_MESSAGE,
      409,
      WHATSAPP_LINKED_DEVICE_OFFLINE_CODE
    );
  }
  return whatsAppDeliveryError(error?.message || fallbackMessage);
}

async function waitForWhatsAppDelivery(sentMessage, timeoutMs = 8000) {
  const runtime = getWhatsAppRuntime();
  if (Number(sentMessage?.ack || 0) >= 2) return;

  const messageId = sentMessage?.id?._serialized;
  if (!messageId) {
    const clientState = await runtime.client?.getState().catch(() => null);
    if (clientState && clientState !== 'CONNECTED') {
      markWhatsAppLinkedDeviceOffline();
      throw whatsAppDeliveryError(
        WHATSAPP_LINKED_DEVICE_OFFLINE_MESSAGE,
        409,
        WHATSAPP_LINKED_DEVICE_OFFLINE_CODE
      );
    }
    throw whatsAppDeliveryError('تعذر تأكيد الإرسال من واتساب. تأكد من اتصال الجهاز المرتبط بالإنترنت ثم حاول مرة أخرى.');
  }

  await new Promise((resolve, reject) => {
    const onAck = (message, ack) => {
      if (message?.id?._serialized !== messageId) return;
      if (Number(ack) >= 2) {
        cleanup();
        resolve();
      } else if (Number(ack) < 0) {
        cleanup();
        reject(whatsAppDeliveryError('رفض واتساب الرسالة قبل وصولها إلى جهاز المستلم.'));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(whatsAppDeliveryError(
        'لم يؤكد واتساب وصول الرسالة؛ قد يكون جهاز المستلم أو الجهاز المرتبط غير متصل بالإنترنت.'
      ));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      runtime.client?.removeListener('message_ack', onAck);
    };
    runtime.client.on('message_ack', onAck);
  });
}

async function sendWhatsAppMessage(phone, message, attachment = null) {
  const runtime = getWhatsAppRuntime();
  await refreshWhatsAppState({ waitMs: 10000 });
  assertWhatsAppClientAvailable(runtime);
  if (!whatsAppState.ready && whatsAppState.status === 'disconnected') {
    markWhatsAppLinkedDeviceOffline();
    throw whatsAppDeliveryError(
      WHATSAPP_LINKED_DEVICE_OFFLINE_MESSAGE,
      409,
      WHATSAPP_LINKED_DEVICE_OFFLINE_CODE
    );
  }
  if (!whatsAppState.ready) {
    throw whatsAppDeliveryError(whatsAppState.message || WHATSAPP_LINK_REQUIRED_MESSAGE, 409);
  }

  let clientState = null;
  let stateError = null;
  try {
    clientState = await runtime.client.getState();
  } catch (error) {
    stateError = error;
  }
  if ((clientState && clientState !== 'CONNECTED') || isWhatsAppNetworkError(stateError)) {
    markWhatsAppLinkedDeviceOffline();
    throw whatsAppDeliveryError(
      WHATSAPP_LINKED_DEVICE_OFFLINE_MESSAGE,
      409,
      WHATSAPP_LINKED_DEVICE_OFFLINE_CODE
    );
  }
  if (clientState !== 'CONNECTED') {
    throw whatsAppDeliveryError('تعذر التحقق من اتصال واتساب حالياً. حاول مرة أخرى بعد قليل.', 409);
  }

  const chatId = `${phone}@c.us`;
  let isRegistered;
  try {
    isRegistered = await runtime.client.isRegisteredUser(chatId);
  } catch (error) {
    throw await normalizeWhatsAppOperationError(error, 'تعذر التحقق من رقم واتساب.');
  }
  if (!isRegistered) {
    throw whatsAppDeliveryError('الرقم غير مسجل في واتساب.');
  }

  let sentMessage;
  try {
    if (attachment?.data && attachment?.type && WhatsAppMessageMedia) {
      const media = new WhatsAppMessageMedia(attachment.type, attachment.data, attachment.name || 'attachment');
      sentMessage = await runtime.client.sendMessage(chatId, media, { caption: message });
    } else {
      sentMessage = await runtime.client.sendMessage(chatId, message);
    }
  } catch (error) {
    throw await normalizeWhatsAppOperationError(error, 'تعذر إرسال رسالة واتساب.');
  }
  await waitForWhatsAppDelivery(sentMessage);
  return sentMessage;
}

/** Reject delivery when the linked client is unavailable, preserving the documented offline error code. */
function assertWhatsAppClientAvailable(runtime) {
  if (!runtime.client) {
    if (isWhatsAppNetworkError(whatsAppState.message)) {
      markWhatsAppLinkedDeviceOffline();
      throw whatsAppDeliveryError(
        WHATSAPP_LINKED_DEVICE_OFFLINE_MESSAGE,
        409,
        WHATSAPP_LINKED_DEVICE_OFFLINE_CODE
      );
    }
    throw whatsAppDeliveryError(WHATSAPP_LINK_REQUIRED_MESSAGE, 409);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomWhatsAppDelay() {
  return crypto.randomInt(6000, 10001);
}

async function disconnectWhatsAppClient() {
  const runtime = getWhatsAppRuntime();
  const client = runtime.client;
  const initializingClient = runtime.initializingClient;
  runtime.client = null;
  runtime.initializingClient = null;
  runtime.starting = null;
  whatsAppState.ready = false;
  whatsAppState.qr = '';
  whatsAppState.status = 'disconnected';
  whatsAppState.message = 'تم إلغاء ربط واتساب.';

  if (client) {
    try {
      await client.logout();
    } catch (error) {
      console.warn('WhatsApp logout cleanup failed:', error.message);
    }
    try {
      await client.destroy();
    } catch (error) {
      console.warn('WhatsApp client cleanup failed:', error.message);
    }
  }

  try {
    await fs.rm(getWhatsAppAuthPath(), { recursive: true, force: true });
  } catch (error) {
    console.warn('WhatsApp auth cleanup failed:', error.message);
  }

  if (initializingClient && initializingClient !== client) {
    try {
      await initializingClient.destroy();
    } catch (error) {
      console.warn('WhatsApp initializing client cleanup failed:', error.message);
    }
  }
}

async function notifyStudentGuardian(studentId, template, context = {}) {
  if (!template) return;
  const [students] = await db().query(
    `
    SELECT
      s.id,
      s.name,
      s.login_number AS loginNumber,
      s.guardian_phone AS guardianPhone,
      c.name AS committeeName
    FROM students s
    LEFT JOIN committees c ON c.id = s.committee_id
    WHERE s.id = ?
    `,
    [studentId]
  );
  const student = students[0];
  if (!student) return;

  const phone = normalizeWhatsAppPhone(student.guardianPhone);
  const message = fillWhatsAppTemplate(template, { ...student, ...context });
  let finalStatus = 'failed';
  let failureReason = null;

  if (!phone) {
    failureReason = 'رقم الجوال غير صالح.';
  } else {
    try {
      await sendWhatsAppMessage(phone, message);
      finalStatus = 'sent';
    } catch (error) {
      failureReason = error.message || 'تعذر الإرسال من واتساب المرتبط.';
    }
  }

  await db().query(
    `
    INSERT INTO whatsapp_messages (student_id, guardian_phone, message, status, failure_reason, message_type)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [student.id, phone || String(student.guardianPhone || ''), message, finalStatus, failureReason, context.messageType || null]
  );
  return finalStatus;
}

async function createStudentAccountNotification(connection, {
  studentId,
  title,
  body,
  dedupeKey,
  actor = null,
}) {
  const cleanTitle = String(title || '').trim().slice(0, 180);
  const cleanBody = String(body || '').trim();
  if (!Number(studentId) || !cleanTitle || !cleanBody || !dedupeKey) return null;
  const [notification] = await connection.query(
    `INSERT INTO app_notifications
      (title, body, dedupe_key, recipient_type, created_by_role, created_by_id, created_by_name)
     VALUES (?, ?, ?, 'specific', ?, ?, ?)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [
      cleanTitle,
      cleanBody,
      String(dedupeKey).slice(0, 220),
      actor?.role || 'system',
      Number(actor?.id || 0) || null,
      actor?.name || 'النظام',
    ],
  );
  const notificationId = Number(notification.insertId || 0);
  if (!notificationId) return null;
  await connection.query(
    `INSERT IGNORE INTO app_notification_recipients
      (notification_id, user_role, user_id)
     VALUES (?, 'student', ?)`,
    [notificationId, Number(studentId)],
  );
  return notificationId;
}

async function notifyStudentGuardianAbsenceOnce(studentId, template, date) {
  if (!template || !isValidDateOnly(date)) return 'skipped';
  const [existingMessages] = await db().query(
    `
    SELECT id
    FROM whatsapp_messages
    WHERE student_id = ?
      AND message_type = 'absence'
      AND status = 'sent'
      AND created_at >= CONVERT_TZ(CONCAT(?, ' ${BUSINESS_DAY_START_TIME}'), '+03:00', '+00:00')
      AND created_at < CONVERT_TZ(DATE_ADD(CONCAT(?, ' ${BUSINESS_DAY_START_TIME}'), INTERVAL 1 DAY), '+03:00', '+00:00')
    LIMIT 1
    `,
    [studentId, date, date]
  );
  if (existingMessages[0]) return 'already_sent';
  return notifyStudentGuardian(studentId, template, { date, messageType: 'absence' });
}

async function notifyRegistrationRequestPhone(request, template, context = {}) {
  if (!template || !request) return 'skipped';
  const phone = normalizeWhatsAppPhone(request.guardianPhone);
  const message = fillWhatsAppTemplate(template, { ...request, ...context });
  let finalStatus = 'failed';
  let failureReason = null;
  let failureCode = null;

  if (!phone) {
    failureReason = 'رقم الجوال غير صالح.';
  } else {
    try {
      await sendWhatsAppMessage(phone, message);
      finalStatus = 'sent';
    } catch (error) {
      failureReason = error.message || 'تعذر الإرسال من واتساب المرتبط.';
      failureCode = error.code || null;
    }
  }

  await db().query(
    `
    INSERT INTO whatsapp_messages (student_id, registration_request_id, guardian_phone, message, status, failure_reason, message_type)
    VALUES (NULL, ?, ?, ?, ?, ?, ?)
    `,
    [request.id || null, phone || String(request.guardianPhone || ''), message, finalStatus, failureReason, context.messageType || null]
  );
  return { status: finalStatus, failureReason, failureCode };
}

const automaticExecutionRunning = new Set();

function isCurrentTimeAtOrAfter(currentTime, targetTime) {
  return currentTime.slice(0, 5) >= targetTime;
}

function normalizeOptionalCommitteeId(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'none' || normalized === 'null' || normalized === 'undefined') return null;
  return normalized;
}

async function findLoginNumberOwner(connection, loginNumber, current = {}) {
  const cleanLoginNumber = String(loginNumber || '').trim();
  if (!cleanLoginNumber) return null;

  const [students] = await connection.query(
    'SELECT id, name FROM students WHERE login_number = ? LIMIT 1',
    [cleanLoginNumber]
  );
  if (students[0] && !(current.type === 'student' && Number(current.id) === Number(students[0].id))) {
    return { type: 'student', label: 'طالب', id: students[0].id, name: students[0].name };
  }

  const [supervisors] = await connection.query(
    'SELECT id, name, role FROM supervisors WHERE login_number = ? LIMIT 1',
    [cleanLoginNumber]
  );
  if (supervisors[0] && !(current.type === 'supervisor' && Number(current.id) === Number(supervisors[0].id))) {
    const _resolveLabel = () => {
      if (supervisors[0].role === 'admin') {
        return 'إداري';
      }
      if (supervisors[0].role === 'manager') {
        return 'مدير';
      }
      if (supervisors[0].role === 'reciter') {
        return 'مقرئ';
      }
      return 'معلم';
    };
    const label = _resolveLabel();
    return { type: supervisors[0].role || 'supervisor', label, id: supervisors[0].id, name: supervisors[0].name };
  }

  return null;
}

async function ensureLoginNumberIsAvailable(connection, loginNumber, current = {}) {
  const owner = await findLoginNumberOwner(connection, loginNumber, current);
  if (owner) {
    const error = new Error(`رقم الدخول مستخدم بالفعل لدى ${owner.label}.`);
    error.statusCode = 409;
    throw error;
  }
}

async function ensureManagerSupervisorAccount() {
  const loginNumber = getManagerLoginNumber();
  if (!loginNumber) return;

  await db().query(
    `
    INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role, is_active)
    VALUES (?, ?, '', '', ?, 'manager', 1)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      job_title = VALUES(job_title),
      role = 'manager',
      is_active = 1
    `,
    [getManagerName(), loginNumber, 'المدير']
  );
}

function getWeekDayFromDate(date) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function addUtcDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function getPreviousConfiguredSessionDate(date, days) {
  const baseDate = isValidDateOnly(date) ? date : getSaudiDateTimeParts().date;
  const normalizedDays = [...new Set((Array.isArray(days) ? days : DEFAULT_RECITATION_SESSION_DAYS).map(Number))]
    .filter((day) => WEEK_DAYS.includes(day));
  const sessionDays = normalizedDays.length ? normalizedDays : DEFAULT_RECITATION_SESSION_DAYS;
  let offset = 0;
  while (!sessionDays.includes(getWeekDayFromDate(addUtcDays(baseDate, -offset))) && offset <= 7) offset += 1;
  return addUtcDays(baseDate, -offset);
}

function getAttendanceSessionDate(date, settings = null) {
  return getPreviousConfiguredSessionDate(date, settings?.recitationSessionDays || DEFAULT_RECITATION_SESSION_DAYS);
}

function isAttendanceDay(date, settings) {
  const days = Array.isArray(settings.attendanceDays) ? settings.attendanceDays.map(Number) : WEEK_DAYS;
  return days.includes(getWeekDayFromDate(date));
}

function isValidDateOnly(value) {
  const date = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function isWeeklyHoliday(date, settings) {
  const days = Array.isArray(settings.weeklyHolidayDays) ? settings.weeklyHolidayDays.map(Number) : DEFAULT_WEEKLY_HOLIDAY_DAYS;
  return days.includes(getWeekDayFromDate(date));
}

function minDateOnly(a, b) {
  return String(a) <= String(b) ? a : b;
}

function getRecitationSessionDays(settings) {
  const days = Array.isArray(settings.recitationSessionDays) ? settings.recitationSessionDays.map(Number) : DEFAULT_RECITATION_SESSION_DAYS;
  const normalized = [...new Set(days)].filter((day) => WEEK_DAYS.includes(day));
  return normalized.length ? normalized : DEFAULT_RECITATION_SESSION_DAYS;
}

function isRecitationSessionDay(date, settings) {
  return getRecitationSessionDays(settings).includes(getWeekDayFromDate(date));
}

function getPreviousRecitationSessionDate(sessionDate, settings) {
  const days = getRecitationSessionDays(settings);
  let offset = 1;
  while (!days.includes(getWeekDayFromDate(addUtcDays(sessionDate, -offset))) && offset <= 7) offset += 1;
  return addUtcDays(sessionDate, -offset);
}

function getEvaluationSessionDate(date, settings) {
  return getPreviousConfiguredSessionDate(date, getRecitationSessionDays(settings));
}

function getRecitationEvaluationWindow(requestedDate, settings, today = getSaudiDateTimeParts().date) {
  const sessionDate = getEvaluationSessionDate(requestedDate, settings);
  const previousSessionDate = getPreviousRecitationSessionDate(sessionDate, settings);
  // The session always shows the amounts due up to and including the session day.
  const generationEndDate = minDateOnly(sessionDate, today);
  return {
    sessionDate,
    previousSessionDate,
    generationEndDate,
  };
}

function canCreateQuranTaskOnDate(settings, date, taskType) {
  if (!isWeeklyHoliday(date, settings)) return true;
  const allowedTypes = Array.isArray(settings.holidayTaskTypes) ? settings.holidayTaskTypes : [];
  return allowedTypes.includes(taskType);
}

function toPositiveInt(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.floor(number));
}

function toPositiveQuarterFace(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0.25, Math.round(number * 4) / 4);
}

function normalizeWeekDay(value, fallback) {
  const day = Number(value);
  return WEEK_DAYS.includes(day) ? day : fallback;
}

function getWeekDaysBetween(startDay, endDay) {
  const start = normalizeWeekDay(startDay, 0);
  const end = normalizeWeekDay(endDay, 6);
  const days = [];
  let cursor = start;
  for (let index = 0; index < 7; index += 1) {
    days.push(cursor);
    if (cursor === end) break;
    cursor = (cursor + 1) % 7;
  }
  return days;
}

function getPlanReviewDays(plan, settings) {
  const reviewAllowedOnHoliday = Array.isArray(settings.holidayTaskTypes) && settings.holidayTaskTypes.includes('review');
  const _resolveHolidayDays = () => {
    if (reviewAllowedOnHoliday) {
      return [];
    }
    return (Array.isArray(settings.weeklyHolidayDays) ? settings.weeklyHolidayDays : DEFAULT_WEEKLY_HOLIDAY_DAYS).map(Number);
  };
  const holidayDays = new Set(_resolveHolidayDays());
  return getWeekDaysBetween(plan.reviewWeekStartDay, plan.reviewWeekEndDay)
    .filter((day) => !holidayDays.has(day));
}

async function getQuranAyah(connection, surah, ayah) {
  return readQuranAyah(connection, surah, ayah);
}

function isValidQuranPosition(position) {
  return Boolean(position?.page && position?.surah && position?.ayah);
}

function isValidQuranPageNumber(page) {
  const pageNumber = Number(page);
  return Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= 604;
}

async function getQuranPageBoundary(connection, page) {
  const rows = await loadQuranPagePositions(connection, page);
  return rows.length ? { start: rows[0], end: rows.at(-1) } : null;
}

async function getQuranPageAyahs(connection, page) {
  return loadQuranPagePositions(connection, page);
}

async function getQuranPageBoundaryInDirection(connection, page, direction = 1) {
  if (Number(direction) >= 0) return getQuranPageBoundary(connection, page);
  const ayahs = await getQuranPageAyahs(connection, page);
  if (!ayahs.length) return null;
  const ordered = [...ayahs].sort((first, second) => compareQuranPositionInDirection(first, second, -1));
  return { start: ordered[0], end: ordered.at(-1) };
}

async function getAdjacentQuranAyah(connection, position, direction) {
  if (!isValidQuranPosition(position)) return null;
  return loadAdjacentQuranPosition(connection, position, direction);
}

async function getAdjacentQuranAyahInDirection(connection, position, direction = 1) {
  if (Number(direction) >= 0) return getAdjacentQuranAyah(connection, position, 'next');
  if (!isValidQuranPosition(position)) return null;
  return readDescendingNextAyah(connection, position);
}

async function getQuranTraversalPageEnd(connection, start, endLimit, direction = 1) {
  let candidate = start;
  if (Number(direction) >= 0) {
    const boundary = await getQuranPageBoundary(connection, start.page);
    candidate = boundary?.end || start;
  } else {
    let cursor = start;
    let guard = 0;
    while (cursor && Number(cursor.page) === Number(start.page) && guard < 300) {
      candidate = cursor;
      const next = await getAdjacentQuranAyahInDirection(connection, cursor, direction);
      if (!next || Number(next.page) !== Number(start.page)) break;
      cursor = next;
      guard += 1;
    }
  }
  return compareQuranPositionInDirection(candidate, endLimit, direction) > 0 ? endLimit : candidate;
}

async function skipFullyMemorizedTraversalPages(connection, position, endLimit, direction, fullyMemorizedPages) {
  let cursor = position;
  let guard = 0;
  while (cursor && fullyMemorizedPages.has(Number(cursor.page)) && guard < 1000) {
    const pageEnd = await getQuranTraversalPageEnd(connection, cursor, endLimit, direction);
    if (compareQuranPositionInDirection(pageEnd, endLimit, direction) >= 0) return null;
    cursor = await getAdjacentQuranAyahInDirection(connection, pageEnd, direction);
    guard += 1;
  }
  return cursor && compareQuranPositionInDirection(cursor, endLimit, direction) <= 0 ? cursor : null;
}

function normalizeQuranRange(range) {
  return {
    startSurah: Number(range.startSurah ?? range.fromSurah ?? 0),
    startAyah: Number(range.startAyah ?? range.fromAyah ?? 0),
    startPage: Number(range.startPage ?? range.fromPage ?? 0),
    endSurah: Number(range.endSurah ?? range.toSurah ?? 0),
    endAyah: Number(range.endAyah ?? range.toAyah ?? 0),
    endPage: Number(range.endPage ?? range.toPage ?? 0),
  };
}

function canonicalizeQuranRange(range) {
  const normalized = normalizeQuranRange(range);
  const start = getQuranRangeStart(normalized);
  const end = getQuranRangeEnd(normalized);
  if (compareQuranPosition(start, end) <= 0) return normalized;
  return {
    startSurah: normalized.endSurah,
    startAyah: normalized.endAyah,
    startPage: normalized.endPage,
    endSurah: normalized.startSurah,
    endAyah: normalized.startAyah,
    endPage: normalized.startPage,
  };
}

function getQuranRangeStart(range) {
  const normalized = normalizeQuranRange(range);
  return { page: normalized.startPage, surah: normalized.startSurah, ayah: normalized.startAyah };
}

function getQuranRangeEnd(range) {
  const normalized = normalizeQuranRange(range);
  return { page: normalized.endPage, surah: normalized.endSurah, ayah: normalized.endAyah };
}

async function getTaskBoundsForPages(connection, plan, fromPage, toPage, direction = 1) {
  const fromBoundary = await getQuranPageBoundaryInDirection(connection, fromPage, direction);
  const toBoundary = fromPage === toPage ? fromBoundary : await getQuranPageBoundaryInDirection(connection, toPage, direction);
  if (!fromBoundary || !toBoundary) return null;
  const from = Number(fromPage) === Number(plan.startPage)
    ? { surah: Number(plan.startSurah), ayah: Number(plan.startAyah) }
    : fromBoundary.start;
  const to = Number(toPage) === Number(plan.endPage)
    ? { surah: Number(plan.endSurah), ayah: Number(plan.endAyah) }
    : toBoundary.end;
  return {
    fromSurah: Number(from.surah),
    fromAyah: Number(from.ayah),
    toSurah: Number(to.surah),
    toAyah: Number(to.ayah),
  };
}

function compareQuranPosition(a, b) {
  if (Number(a.page) !== Number(b.page)) return Number(a.page) - Number(b.page);
  if (Number(a.surah) !== Number(b.surah)) return Number(a.surah) - Number(b.surah);
  return Number(a.ayah) - Number(b.ayah);
}

function getQuranRangeDirection(start, end) {
  if (Number(start.surah) !== Number(end.surah)) {
    return Number(start.surah) < Number(end.surah) ? 1 : -1;
  }
  return Number(start.ayah) <= Number(end.ayah) ? 1 : -1;
}

function getCanonicalQuranBounds(first, second) {
  return compareQuranPosition(first, second) <= 0
    ? { start: first, end: second }
    : { start: second, end: first };
}

function roundQuranFaces(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return 0;
  const roundedToQuarter = Math.round(Math.max(0, number) * 4) / 4;
  return number > 0 && roundedToQuarter === 0 ? 0.25 : roundedToQuarter;
}

function getQuranVerseLine(position) {
  return quranVerseLineByKey.get(`${Number(position?.surah || 0)}:${Number(position?.ayah || 0)}`) || null;
}

function getQuranLineCoordinate(page, line) {
  return ((Number(page) - 1) * QURAN_LINES_PER_PAGE) + Number(line);
}

function calculateQuranRangeFacesFromLines(start, end) {
  return measureQuranFaces(start, end);
}

async function buildQuranRangeByMushafFaces(connection, start, endLimit, targetFaces) {
  if (!isValidQuranPosition(start) || !isValidQuranPosition(endLimit) || compareQuranPosition(start, endLimit) > 0) return null;
  const requestedFaces = Math.max(0.25, roundQuranFaces(targetFaces || 1));
  return buildForwardQuranFaceRange({
    start,
    endLimit,
    targetFaces: requestedFaces,
    getPageEnd: (cursor) => getQuranTraversalPageEnd(connection, cursor, endLimit, 1),
    getNextPosition: (position) => getAdjacentQuranAyahInDirection(connection, position, 1),
    getHalfPageEnd: async (halfStart) => {
      const startLayout = getQuranVerseLine(halfStart);
      const endLimitLayout = getQuranVerseLine(endLimit);
      if (startLayout && endLimitLayout) {
        const targetEndLine = Number(startLayout.startLine) + Math.ceil(QURAN_LINES_PER_PAGE / 2) - 1;
        const candidate = quranVerseLineRows.find((row) => (
          row.index >= startLayout.index
            && row.index <= endLimitLayout.index
            && Number(row.endPage) === Number(startLayout.startPage)
            && Number(row.endLine) >= targetEndLine
        ));
        return candidate
          ? (() => {
              const [surah, ayah] = candidate.key.split(':').map(Number);
              return { page: Number(candidate.endPage), surah, ayah };
            })()
          : await getQuranTraversalPageEnd(connection, halfStart, endLimit, 1);
      }
      return getQuranTraversalPageEnd(connection, halfStart, endLimit, 1);
    },
    getFractionalPageEnd: async (fractionalStart, fraction) => {
      const startLayout = getQuranVerseLine(fractionalStart);
      const endLimitLayout = getQuranVerseLine(endLimit);
      if (!startLayout || !endLimitLayout) {
        return getQuranTraversalPageEnd(connection, fractionalStart, endLimit, 1);
      }
      const targetEndLine = Number(startLayout.startLine)
        + Math.ceil(QURAN_LINES_PER_PAGE * Number(fraction)) - 1;
      const candidate = quranVerseLineRows.find((row) => (
        row.index >= startLayout.index
          && row.index <= endLimitLayout.index
          && Number(row.endPage) === Number(startLayout.startPage)
          && Number(row.endLine) >= targetEndLine
      ));
      if (!candidate) return getQuranTraversalPageEnd(connection, fractionalStart, endLimit, 1);
      const [surah, ayah] = candidate.key.split(':').map(Number);
      return { page: Number(candidate.endPage), surah, ayah };
    },
  });
}
async function getDescendingMushafFractionEnd(connection, start, endLimit, fraction) {
  const ordered = [];
  let cursor = start;
  let guard = 0;
  while (
    cursor
    && Number(cursor.page) === Number(start.page)
    && compareQuranPositionInDirection(cursor, endLimit, -1) <= 0
    && guard < 300
  ) {
    ordered.push(cursor);
    cursor = await getAdjacentQuranAyahInDirection(connection, cursor, -1);
    guard += 1;
  }
  if (!ordered.length) return null;
  return selectDescendingFractionEnd(ordered, start, fraction);
}

function selectDescendingFractionEnd(ordered, start, fraction) {
  const coveredLines = new Set();
  let candidate = ordered[0];
  for (const ayah of ordered) {
    const layout = getQuranVerseLine(ayah);
    if (!layout) continue;
    candidate = ayah;
    addCoveredMushafLines(layout, start, coveredLines);
    if (coveredLines.size >= Math.ceil(QURAN_LINES_PER_PAGE * Number(fraction))) break;
  }
  return candidate;
}

/** Add the visible verse lines on the starting page to the fractional-face measurement. */
function addCoveredMushafLines(layout, start, coveredLines) {
  if (Number(layout.startPage) <= Number(start.page) && Number(layout.endPage) >= Number(start.page)) {
    const firstLine = Number(layout.startPage) === Number(start.page) ? Number(layout.startLine) : 1;
    const lastLine = Number(layout.endPage) === Number(start.page) ? Number(layout.endLine) : QURAN_LINES_PER_PAGE;
    for (let line = firstLine;line <= lastLine;line += 1) coveredLines.add(line);
  }
}

async function buildDescendingQuranRangeByMushafFaces(connection, start, endLimit, targetFaces) {
  if (
    !isValidQuranPosition(start)
    || !isValidQuranPosition(endLimit)
    || compareQuranPositionInDirection(start, endLimit, -1) > 0
  ) return null;
  const requestedFaces = Math.max(0.25, roundQuranFaces(targetFaces || 1));
  const wholeFaces = Math.floor(requestedFaces);
  const fractionalFace = Number((requestedFaces - wholeFaces).toFixed(2));
  let end = start;
  let cursor = start;
  const segments = [];

  ({ cursor, end } = await collectDescendingWholeFaces({ wholeFaces, cursor, connection, endLimit, segments, end }));

  if (fractionalFace > 0 && compareQuranPositionInDirection(end, endLimit, -1) < 0) {
    const fractionalStart = wholeFaces > 0 ? cursor : start;
    if (fractionalStart && compareQuranPositionInDirection(fractionalStart, endLimit, -1) <= 0) {
      const fractionalEnd = await getDescendingMushafFractionEnd(
        connection,
        fractionalStart,
        endLimit,
        fractionalFace,
      );
      if (fractionalEnd) {
        end = fractionalEnd;
        segments.push({ start: fractionalStart, end: fractionalEnd, faces: fractionalFace });
      }
    }
  }

  if (compareQuranPositionInDirection(end, endLimit, -1) > 0) end = endLimit;
  return { start, end, faces: requestedFaces, segments };
}

/** Collect whole faces in Quran traversal order without crossing the requested end. */
async function collectDescendingWholeFaces({ wholeFaces, cursor, connection, endLimit, segments, end: initialEnd }) {
  let end = initialEnd;
  for (let face = 0; face < wholeFaces && cursor; face += 1) {
    const segmentEnd = await getQuranTraversalPageEnd(connection, cursor, endLimit, -1);
    segments.push({ start: cursor, end: segmentEnd, faces: 1 });
    end = segmentEnd;
    if (compareQuranPositionInDirection(end, endLimit, -1) >= 0) break;
    cursor = await getAdjacentQuranAyahInDirection(connection, end, -1);
  }
  return { cursor, end };
}

function fallbackQuranFaces(start, end) {
  if (!isValidQuranPosition(start) || !isValidQuranPosition(end)) return 0;
  return roundQuranFaces(Math.abs(Number(end.page) - Number(start.page)) + 1);
}

function acceptedMemorizationSql(tableAlias = '') {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return `(
    ${prefix}teacher_completed = 1
    OR (
      ${prefix}teacher_completed IS NULL
      AND ${prefix}student_status = 'done'
      AND COALESCE(${prefix}execution_state, '') IN ('complete', 'partial', 'extra')
    )
  )`;
}

async function normalizePriorMemorizationRanges(connection, items) {
  const rawItems = Array.isArray(items) ? items : [];
  const ranges = [];
  await collectValidatedMemorizationRanges(rawItems, connection, ranges);

  const sortedRanges = ranges.toSorted((a, b) => compareQuranPosition(getQuranRangeStart(a), getQuranRangeStart(b)));
  for (let index = 1; index < sortedRanges.length; index += 1) {
    if (compareQuranPosition(getQuranRangeStart(sortedRanges[index]), getQuranRangeEnd(sortedRanges[index - 1])) <= 0) {
      const error = new Error('مقاطع المحفوظ السابق لا يمكن أن تتداخل.');
      error.statusCode = 422;
      throw error;
    }
  }
  return sortedRanges;
}

/** Resolve and validate each supplied range before checking overlap across the collection. */
async function collectValidatedMemorizationRanges(rawItems, connection, ranges) {
  for (const item of rawItems) {
    const startPage = Number(item.startPage || 0);
    const endPage = Number(item.endPage || 0);
    if ((startPage || endPage) && (!isValidQuranPageNumber(startPage) || !isValidQuranPageNumber(endPage) || startPage > endPage)) {
      const error = new Error('نطاق صفحات المحفوظ السابق غير صحيح.');
      error.statusCode = 422;
      throw error;
    }
    const startBoundary = startPage ? await getQuranPageBoundary(connection, startPage) : null;
    const endBoundary = endPage ? await getQuranPageBoundary(connection, endPage) : null;
    const start = startBoundary?.start || await getQuranAyah(connection, Number(item.startSurah || 0), Number(item.startAyah || 0));
    const end = endBoundary?.end || await getQuranAyah(connection, Number(item.endSurah || 0), Number(item.endAyah || 0));
    if (!start || !end) {
      const error = new Error('أحد مقاطع المحفوظ السابق غير صحيح.');
      error.statusCode = 422;
      throw error;
    }
    if (compareQuranPosition(start, end) > 0) {
      const error = new Error('بداية المحفوظ السابق يجب أن تكون قبل نهايته.');
      error.statusCode = 422;
      throw error;
    }
    ranges.push({
      startSurah: start.surah,
      startAyah: start.ayah,
      startPage: start.page,
      endSurah: end.surah,
      endAyah: end.ayah,
      endPage: end.page,
    });
  }
}

async function savePriorMemorizationRanges(connection, planId, studentId, ranges) {
  if (!ranges.length) return;
  await connection.query(
    `
    INSERT INTO student_quran_plan_prior_memorization
      (plan_id, student_id, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page)
    VALUES ?
    `,
    [ranges.map((range) => [
      planId,
      studentId,
      range.startSurah,
      range.startAyah,
      range.startPage,
      range.endSurah,
      range.endAyah,
      range.endPage,
    ])]
  );
}

async function mergeQuranRanges(connection, ranges = []) {
  const sortedRanges = (ranges || [])
    .map(normalizeQuranRange)
    .filter((range) => isValidQuranPosition(getQuranRangeStart(range)) && isValidQuranPosition(getQuranRangeEnd(range)))
    .sort((a, b) => compareQuranPosition(getQuranRangeStart(a), getQuranRangeStart(b)));
  const merged = [];
  for (const range of sortedRanges) {
    const current = { ...range };
    const last = merged.at(-1);
    if (!last) {
      merged.push(current);
      continue;
    }
    const lastEnd = getQuranRangeEnd(last);
    const currentStart = getQuranRangeStart(current);
    const nextAfterLast = await getAdjacentQuranAyah(connection, lastEnd, 'next');
    const overlaps = compareQuranPosition(currentStart, lastEnd) <= 0;
    const touches = nextAfterLast && compareQuranPosition(currentStart, nextAfterLast) <= 0;
    if (overlaps || touches) {
      if (compareQuranPosition(getQuranRangeEnd(current), lastEnd) > 0) {
        last.endSurah = current.endSurah;
        last.endAyah = current.endAyah;
        last.endPage = current.endPage;
      }
    } else {
      merged.push(current);
    }
  }
  return merged;
}

async function getPriorMemorizationRanges(connection, planId) {
  const [rows] = await connection.query(
    `
    SELECT
      id,
      start_surah AS startSurah,
      start_ayah AS startAyah,
      start_page AS startPage,
      end_surah AS endSurah,
      end_ayah AS endAyah,
      end_page AS endPage
    FROM student_quran_plan_prior_memorization
    WHERE plan_id = ?
    ORDER BY start_page ASC, end_page ASC
    `,
    [planId]
  );
  return rows;
}

async function savePriorMemorizationRange(connection, planId, studentId, range) {
  const table = planId ? 'student_quran_plan_prior_memorization' : 'student_quran_prior_memorization';
  await connection.query(`INSERT INTO ${table}
    (${planId ? 'plan_id, ' : ''}student_id, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page, created_at)
    VALUES (${planId ? '?, ' : ''}?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
  [...(planId ? [planId] : []), studentId, range.startSurah, range.startAyah, range.startPage,
    range.endSurah, range.endAyah, range.endPage, range.createdAt || null]);
}

async function removePriorMemorizationQuranRange(connection, studentId, start, end, standalone = false) {
  const table = standalone ? 'student_quran_prior_memorization' : 'student_quran_plan_prior_memorization';
  const [rows] = await connection.query(
    `
    SELECT
      id,
      ${standalone ? 'NULL' : 'plan_id'} AS planId,
      created_at AS createdAt,
      start_surah AS startSurah,
      start_ayah AS startAyah,
      start_page AS startPage,
      end_surah AS endSurah,
      end_ayah AS endAyah,
      end_page AS endPage
    FROM ${table}
    WHERE student_id = ?
      AND (
        start_page < ?
        OR (start_page = ? AND start_surah < ?)
        OR (start_page = ? AND start_surah = ? AND start_ayah <= ?)
      )
      AND (
        end_page > ?
        OR (end_page = ? AND end_surah > ?)
        OR (end_page = ? AND end_surah = ? AND end_ayah >= ?)
      )
    FOR UPDATE
    `,
    [
      studentId,
      end.page,
      end.page,
      end.surah,
      end.page,
      end.surah,
      end.ayah,
      start.page,
      start.page,
      start.surah,
      start.page,
      start.surah,
      start.ayah,
    ]
  );
  if (!rows.length) return 0;

  const ids = rows.map((row) => row.id);
  await connection.query(
    `DELETE FROM ${table} WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );

  for (const row of rows) {
    const rowStart = getQuranRangeStart(row);
    const rowEnd = getQuranRangeEnd(row);
    if (compareQuranPosition(rowStart, start) < 0) {
      const leftEnd = await getAdjacentQuranAyah(connection, start, 'previous');
      if (leftEnd && compareQuranPosition(rowStart, leftEnd) <= 0) {
        await savePriorMemorizationRange(connection, row.planId, studentId, {
          createdAt: row.createdAt,
          startSurah: rowStart.surah,
          startAyah: rowStart.ayah,
          startPage: rowStart.page,
          endSurah: leftEnd.surah,
          endAyah: leftEnd.ayah,
          endPage: leftEnd.page,
        });
      }
    }
    if (compareQuranPosition(rowEnd, end) > 0) {
      const rightStart = await getAdjacentQuranAyah(connection, end, 'next');
      if (rightStart && compareQuranPosition(rightStart, rowEnd) <= 0) {
        await savePriorMemorizationRange(connection, row.planId, studentId, {
          createdAt: row.createdAt,
          startSurah: rightStart.surah,
          startAyah: rightStart.ayah,
          startPage: rightStart.page,
          endSurah: rowEnd.surah,
          endAyah: rowEnd.ayah,
          endPage: rowEnd.page,
        });
      }
    }
  }
  return rows.length;
}

async function removePriorMemorizationPageRange(connection, studentId, startPage, endPage) {
  const startBoundary = await getQuranPageBoundary(connection, startPage);
  const endBoundary = startPage === endPage ? startBoundary : await getQuranPageBoundary(connection, endPage);
  if (!startBoundary || !endBoundary) return 0;
  const planned = await removePriorMemorizationQuranRange(connection, studentId, startBoundary.start, endBoundary.end);
  const standalone = await removePriorMemorizationQuranRange(connection, studentId, startBoundary.start, endBoundary.end, true);
  return planned + standalone;
}

function quranPositionInRange(ayah, range) {
  const normalized = canonicalizeQuranRange(range);
  return compareQuranPosition(ayah, getQuranRangeStart(normalized)) >= 0
    && compareQuranPosition(ayah, getQuranRangeEnd(normalized)) <= 0;
}

function quranPositionInRanges(ayah, ranges) {
  return ranges.some((range) => quranPositionInRange(ayah, range));
}

async function expandQuranTraversalRange(connection, range) {
  const normalized = normalizeQuranRange(range);
  const start = getQuranRangeStart(normalized);
  const end = getQuranRangeEnd(normalized);
  if (!isValidQuranPosition(start) || !isValidQuranPosition(end)) return [];
  const direction = getQuranRangeDirection(start, end);
  if (direction >= 0) return [normalized];

  const ayahs = await getQuranAyahsInPageRange(connection, direction < 0 ? 1 : start.page, direction < 0 ? 604 : end.page);
  const ranges = [];
  let current = null;
  const closeCurrent = () => {
    if (current) ranges.push(current);
    current = null;
  };
  for (const ayah of ayahs) {
    const included = compareQuranPositionInDirection(ayah, start, direction) >= 0
      && compareQuranPositionInDirection(ayah, end, direction) <= 0;
    if (!included) {
      closeCurrent();
      continue;
    }
    if (!current) {
      current = {
        startSurah: ayah.surah,
        startAyah: ayah.ayah,
        startPage: ayah.page,
        endSurah: ayah.surah,
        endAyah: ayah.ayah,
        endPage: ayah.page,
      };
    } else {
      current.endSurah = ayah.surah;
      current.endAyah = ayah.ayah;
      current.endPage = ayah.page;
    }
  }
  closeCurrent();
  return ranges;
}

async function getCompletedMemorizationRanges(connection, filters = {}) {
  const where = ["task_type = 'memorization'", filters.approvedOnly ? 'teacher_completed = 1' : acceptedMemorizationSql()];
  const params = [];
  if (filters.studentId) {
    where.push('student_id = ?');
    params.push(filters.studentId);
  }
  if (filters.planId) {
    where.push('plan_id = ?');
    params.push(filters.planId);
  }
  if (filters.beforeDate) {
    where.push('task_date < ?');
    params.push(filters.beforeDate);
  }
  if (filters.afterDate) {
    where.push('task_date >= ?');
    params.push(filters.afterDate);
  }
  const [rows] = await connection.query(
    `
    SELECT
      from_surah AS startSurah,
      from_ayah AS startAyah,
      from_page AS startPage,
      COALESCE(actual_to_surah, to_surah) AS endSurah,
      COALESCE(actual_to_ayah, to_ayah) AS endAyah,
      COALESCE(actual_to_page, to_page) AS endPage
    FROM student_quran_tasks
    WHERE ${where.join(' AND ')}
      AND from_surah IS NOT NULL
      AND from_ayah IS NOT NULL
      AND to_surah IS NOT NULL
      AND to_ayah IS NOT NULL
    ORDER BY from_page ASC, from_surah ASC, from_ayah ASC
    `,
    params
  );
  const expanded = await Promise.all(rows.map((range) => expandQuranTraversalRange(connection, range)));
  return expanded.flat();
}

async function getPriorMemorizationRangesForStudent(connection, studentId) {
  const [rows] = await connection.query(
    `
    SELECT
      start_surah AS startSurah,
      start_ayah AS startAyah,
      start_page AS startPage,
      end_surah AS endSurah,
      end_ayah AS endAyah,
      end_page AS endPage
    FROM student_quran_plan_prior_memorization
    WHERE student_id = ?
    UNION ALL
    SELECT
      start_surah AS startSurah,
      start_ayah AS startAyah,
      start_page AS startPage,
      end_surah AS endSurah,
      end_ayah AS endAyah,
      end_page AS endPage
    FROM student_quran_prior_memorization
    WHERE student_id = ?
    ORDER BY startPage ASC, startSurah ASC, startAyah ASC
    `,
    [studentId, studentId]
  );
  return rows.map(normalizeQuranRange);
}

async function getStudentMemorizedRanges(connection, studentId, filters = {}) {
  const prior = await getPriorMemorizationRangesForStudent(connection, studentId);
  const completed = await getCompletedMemorizationRanges(connection, {
    studentId,
    planId: filters.planId,
    beforeDate: filters.beforeDate,
    approvedOnly: filters.approvedOnly,
  });
  return [...prior, ...completed];
}

async function getNextUnmemorizedPlanPosition(connection, plan, filters = {}) {
  const start = { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) };
  const end = { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) };
  const direction = getQuranRangeDirection(start, end);
  const ayahs = await getQuranAyahsInPageRange(connection, direction < 0 ? 1 : start.page, direction < 0 ? 604 : end.page);
  if (!ayahs.length) throw new Error('تعذر التحقق من تسلسل الحفظ لعدم توفر بيانات الآيات.');
  const ranges = await getStudentMemorizedRanges(connection, plan.studentId, filters);
  return findNextUnmemorizedPosition({ ayahs, ranges, start, end, direction });
}

async function getQuranAyahsInPageRange(connection, startPage, endPage) {
  return readQuranRange(connection, startPage, endPage);
}

async function getQuranAyahsForTask(connection, task) {
  const review = parseReviewExecution(task.reviewExecution);
  if (task.reviewExecution && !review) return [];
  if (review) {
    const ranges = await Promise.all(review.ranges.map(({ start, end }) => getQuranAyahsForTask(connection, {
      fromPage: start.page, fromSurah: start.surah, fromAyah: start.ayah, toPage: end.page, toSurah: end.surah, toAyah: end.ayah,
    })));
    return ranges.flat();
  }
  const start = {
    page: Number(task.fromPage || 0),
    surah: Number(task.fromSurah || 0),
    ayah: Number(task.fromAyah || 0),
  };
  const end = {
    page: Number(task.actualToPage || task.toPage || 0),
    surah: Number(task.actualToSurah || task.toSurah || 0),
    ayah: Number(task.actualToAyah || task.toAyah || 0),
  };
  if (!isValidQuranPosition(start) || !isValidQuranPosition(end)) return [];
  const direction = getQuranRangeDirection(start, end);
  const ayahs = await getQuranAyahsInPageRange(connection, start.page, end.page);
  return ayahs
    .filter((ayah) => (
      compareQuranPositionInDirection(ayah, start, direction) >= 0
      && compareQuranPositionInDirection(ayah, end, direction) <= 0
    ))
    .sort((first, second) => compareQuranPositionInDirection(first, second, direction));
}

function parseStoredWordMarks(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function buildQuranRangeMushafData(connection, range, storedWordMarks = []) {
  const task = {
    fromPage: Number(range.startPage),
    fromSurah: Number(range.startSurah),
    fromAyah: Number(range.startAyah),
    toPage: Number(range.endPage),
    toSurah: Number(range.endSurah),
    toAyah: Number(range.endAyah),
  };
  const ayahs = await getQuranAyahsForTask(connection, task);
  const pageNumbers = await getQcfTaskPageNumbers(task);
  const pages = await Promise.all(pageNumbers.map((page) => getQcfMushafPage(page)));
  return {
    ayahs,
    marks: [],
    wordMarks: parseStoredWordMarks(storedWordMarks),
    pages,
    allowedRange: {
      fromSurah: task.fromSurah,
      fromAyah: task.fromAyah,
      toSurah: task.toSurah,
      toAyah: task.toAyah,
      direction: getQuranRangeDirection(taskStartPosition(task), taskEndPosition(task)),
    },
  };
}

function getExpectedMemorizationListeningCount(task, settings) {
  if (task.taskType !== 'memorization') return 0;
  return normalizeRepeatCount(task.track === 'mastery' ? settings.masteryListeningCount : settings.memorizationListeningCount, 3);
}

async function normalizeQuranRangeWordMarks(connection, range, payload) {
  if (!Array.isArray(payload)) return null;
  const data = await buildQuranRangeMushafData(connection, range);
  const allowedVerseKeys = new Set(data.ayahs.map((ayah) => `${ayah.surah}:${ayah.ayah}`));
  const words = data.pages.flatMap((page) => page?.words || []);
  const wordIndexByLocation = new Map(words.map((word, index) => [word.location, index]));
  const normalized = [];
  for (const rawMark of payload) {
    const startIndex = wordIndexByLocation.get(String(rawMark?.startLocation || ''));
    const endIndex = wordIndexByLocation.get(String(rawMark?.endLocation || ''));
    const markType = normalizeWordMarkType(rawMark);
    if (startIndex === undefined || endIndex === undefined || !markType) return null;
    const fromIndex = Math.min(startIndex, endIndex);
    const toIndex = Math.max(startIndex, endIndex);
    const selectedWords = words.slice(fromIndex, toIndex + 1).filter((word) => word.charType === 'word');
    if (!selectedWords.length || selectedWords.some((word) => !allowedVerseKeys.has(word.verseKey))) return null;
    normalized.push({
      page: Number(selectedWords[0].page),
      startLocation: selectedWords[0].location,
      endLocation: selectedWords.at(-1).location,
      selectedText: formatQuranSelectionText(selectedWords).slice(0, 1000),
      markType,
      notes: String(rawMark?.notes || '').trim().slice(0, 500),
    });
  }
  return normalized;
}

function normalizeAdministratorAccount(body) {
  const account = normalizeStaffAccount(body, 'اسم الإداري');
  const jobTitle = String(body.jobTitle || 'إداري').trim() || 'إداري';
  const permissions = cleanAdministratorDashboardPermissions(body.permissions);
  if (jobTitle.length > 120) throw invalidInput('المسمى الوظيفي أطول من الحد المسموح.');
  return { ...account, jobTitle, permissions };
}

function normalizeStaffAccount(body, nameLabel) {
  return {
    name: normalizeAccountName(body.name, nameLabel),
    loginNumber: normalizeAccountLoginNumber(body.loginNumber),
    nationalId: normalizeOptionalNationalId(body.nationalId),
    phone: normalizeAccountPhone(body.phone),
  };
}

async function getQuranTaskAyahMarks(connection, taskIds) {
  return queryTaskGroups(connection, taskIds, `
    SELECT
      m.task_id AS taskId,
      m.surah_number AS surah,
      s.name_arabic AS surahName,
      m.ayah_number AS ayah,
      m.ayah_text AS textUthmani,
      m.mark_type AS markType,
      m.occurrence_count AS occurrenceCount
    FROM student_quran_task_ayah_marks m
    LEFT JOIN quran_surahs s ON s.surah_number = m.surah_number
    WHERE m.task_id IN (?)
    ORDER BY m.task_id ASC, m.surah_number ASC, m.ayah_number ASC, FIELD(m.mark_type, 'mistake', 'lahn', 'warning')
    `, (row) => ({
      surah: Number(row.surah),
      surahName: row.surahName || '',
      ayah: Number(row.ayah),
      textUthmani: row.textUthmani || '',
      markType: row.markType,
      occurrenceCount: Number(row.occurrenceCount || 0),
    }));
}

async function getQuranTaskWordMarks(connection, taskIds) {
  return queryTaskGroups(connection, taskIds, `
    SELECT
      id,
      task_id AS taskId,
      page_number AS page,
      start_surah AS startSurah,
      start_ayah AS startAyah,
      start_word_position AS startWordPosition,
      end_surah AS endSurah,
      end_ayah AS endAyah,
      end_word_position AS endWordPosition,
      selected_text AS selectedText,
      mark_type AS markType,
      notes
    FROM student_quran_task_word_marks
    WHERE task_id IN (?)
    ORDER BY task_id ASC, id ASC
    `, (row) => ({
      id: Number(row.id),
      page: Number(row.page),
      startSurah: Number(row.startSurah),
      startAyah: Number(row.startAyah),
      endSurah: Number(row.endSurah),
      endAyah: Number(row.endAyah),
      startLocation: `${Number(row.startSurah)}:${Number(row.startAyah)}:${Number(row.startWordPosition)}`,
      endLocation: `${Number(row.endSurah)}:${Number(row.endAyah)}:${Number(row.endWordPosition)}`,
      selectedText: row.selectedText || '',
      markType: row.markType,
      notes: row.notes || '',
    }));
}

async function getQuranTaskDisplayMarks(connection, taskIds) {
  const ids = [...new Set((taskIds || []).map(Number).filter(Boolean))];
  const [wordMarksByTask, ayahMarksByTask] = await Promise.all([
    getQuranTaskWordMarks(connection, ids),
    getQuranTaskAyahMarks(connection, ids),
  ]);
  const grouped = new Map();
  for (const taskId of ids) {
    const wordMarks = wordMarksByTask.get(taskId) || [];
    grouped.set(taskId, wordMarks.length ? wordMarks : (ayahMarksByTask.get(taskId) || []));
  }
  return grouped;
}

const quranTaskMarkVerseKey = (mark = {}) => {
  if (mark.startSurah && mark.startAyah) return `${Number(mark.startSurah)}:${Number(mark.startAyah)}`;
  if (mark.startLocation) return String(mark.startLocation).split(':').slice(0, 2).join(':');
  return `${Number(mark.surah || 0)}:${Number(mark.ayah || 0)}`;
};

function buildQuranPageFaceStats(ayahs) {
  const byPage = new Map();
  for (const ayah of ayahs) {
    const page = Number(ayah.page);
    if (!byPage.has(page)) byPage.set(page, { total: 0, positions: new Map() });
    const item = byPage.get(page);
    item.total += 1;
    item.positions.set(`${Number(ayah.surah)}:${Number(ayah.ayah)}`, item.total);
  }
  return byPage;
}

function calculateQuranRangeFacesFromStats(range, pageStats) {
  const bounds = getCanonicalQuranBounds(getQuranRangeStart(range), getQuranRangeEnd(range));
  const { start, end } = bounds;
  if (!isValidQuranPosition(start) || !isValidQuranPosition(end)) return 0;

  let faces = 0;
  for (let page = Number(start.page); page <= Number(end.page); page += 1) {
    const stats = pageStats.get(page);
    if (!stats?.total) return fallbackQuranFaces(start, end);
    const firstAyahIndex = page === Number(start.page)
      ? stats.positions.get(`${Number(start.surah)}:${Number(start.ayah)}`)
      : 1;
    const lastAyahIndex = page === Number(end.page)
      ? stats.positions.get(`${Number(end.surah)}:${Number(end.ayah)}`)
      : stats.total;
    if (!firstAyahIndex || !lastAyahIndex) return fallbackQuranFaces(start, end);
    if (lastAyahIndex >= firstAyahIndex) {
      faces += (lastAyahIndex - firstAyahIndex + 1) / stats.total;
    }
  }
  return roundQuranFaces(faces);
}

async function calculateQuranRangeFaces(connection, range) {
  const measured = measureQuranFaces(getQuranRangeStart(range), getQuranRangeEnd(range));
  if (measured > 0) return measured;
  const bounds = getCanonicalQuranBounds(getQuranRangeStart(range), getQuranRangeEnd(range));
  const { start, end } = bounds;
  if (!isValidQuranPosition(start) || !isValidQuranPosition(end)) return 0;
  const lineFaces = calculateQuranRangeFacesFromLines(start, end);
  if (lineFaces > 0) return lineFaces;
  const ayahs = await getQuranAyahsInPageRange(connection, start.page, end.page);
  return calculateQuranRangeFacesFromStats(range, buildQuranPageFaceStats(ayahs));
}

async function buildQuranRangeByFaceTarget(connection, start, endLimit, targetFaces) {
  if (!isValidQuranPosition(start) || !isValidQuranPosition(endLimit)) return null;
  if (getQuranRangeDirection(start, endLimit) < 0) {
    return buildDescendingQuranRangeByMushafFaces(connection, start, endLimit, targetFaces);
  }
  const mushafRange = await buildQuranRangeByMushafFaces(connection, start, endLimit, targetFaces);
  if (mushafRange) return mushafRange;
  const targetUnits = Math.max(1, Math.round(Math.max(0.25, Number(targetFaces || 1)) * 4));
  const startBoundary = await getQuranPageBoundary(connection, start.page);
  if (!startBoundary) return null;

  const startsAtPageStart = isSameQuranPosition(start, startBoundary.start);
  let unitsRemaining = startsAtPageStart ? targetUnits : Math.max(1, targetUnits - 1);
  let usedUnits = 0;
  let cursorPage = Number(start.page);
  let end = start;

  if (!startsAtPageStart) {
    end = startBoundary.end;
    usedUnits = 1;
    unitsRemaining -= 1;
    if (compareQuranPosition(end, endLimit) >= 0 || unitsRemaining <= 0) {
      const cappedEnd = compareQuranPosition(end, endLimit) > 0 ? endLimit : end;
      return { start, end: cappedEnd, faces: roundQuranFaces(usedUnits / 4) };
    }
    cursorPage += 1;
  }

  ({ end, usedUnits } = await collectFallbackQuranFaces({ cursorPage, endLimit, unitsRemaining, start, startBoundary, connection, end, usedUnits }));

  return { start, end, faces: roundQuranFaces(Math.max(usedUnits, 1) / 4) };
}

/** Measure page fractions from the canonical boundaries when line-layout data is unavailable. */
async function collectFallbackQuranFaces({ cursorPage, endLimit, unitsRemaining, start, startBoundary, connection, end: initialEnd, usedUnits }) {
  let end = initialEnd;
  while (cursorPage <= Number(endLimit.page) && unitsRemaining > 0) {
    const boundary = await getFallbackPageBoundary(cursorPage, start, startBoundary, connection);
    if (!boundary) break;

    const pageEnd = boundary.end;
    const pageAyahs = await getQuranPageAyahs(connection, cursorPage);
    if (unitsRemaining < 4 && pageAyahs.length) {
      const fractionEnd = pageAyahs[Math.max(0, Math.ceil(pageAyahs.length * (unitsRemaining / 4)) - 1)];
      end = compareQuranPosition(fractionEnd, endLimit) > 0 ? endLimit : fractionEnd;
      usedUnits += unitsRemaining;
      break;
    }

    end = compareQuranPosition(pageEnd, endLimit) > 0 ? endLimit : pageEnd;
    usedUnits += 4;
    unitsRemaining -= 4;
    if (compareQuranPosition(end, endLimit) >= 0) break;
    cursorPage += 1;
  }
  return { cursorPage, unitsRemaining, end, usedUnits };
}

/** Reuse the starting boundary and read each subsequent page boundary once. */
async function getFallbackPageBoundary(cursorPage, start, startBoundary, connection) {
  return cursorPage === Number(start.page) ? startBoundary : await getQuranPageBoundary(connection, cursorPage);
}

function getMemorizationScheduleDays(settings = {}) {
  const holidays = new Set((Array.isArray(settings.weeklyHolidayDays) ? settings.weeklyHolidayDays : DEFAULT_WEEKLY_HOLIDAY_DAYS).map(Number));
  const allowedOnHoliday = Array.isArray(settings.holidayTaskTypes) && settings.holidayTaskTypes.includes('memorization');
  return WEEK_DAYS.filter((day) => allowedOnHoliday || !holidays.has(day));
}

function getStoredPlanScheduleDays(_plan, settings) {
  return getMemorizationScheduleDays(settings);
}

async function getPlanProgressContext(connection, plan, date, settings, actualStartOverride = null) {
  if (!plan) return null;
  const planStart = { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) };
  const planEnd = { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) };
  const direction = getQuranRangeDirection(planStart, planEnd);
  const actualStart = actualStartOverride || (
    plan.nextMemorizationPage && plan.nextMemorizationSurah && plan.nextMemorizationAyah
      ? { page: Number(plan.nextMemorizationPage), surah: Number(plan.nextMemorizationSurah), ayah: Number(plan.nextMemorizationAyah) }
      : planStart
  );
  if (!isValidQuranPosition(actualStart) || compareQuranPositionInDirection(actualStart, planEnd, direction) > 0) return null;
  const normalRange = await buildQuranRangeByFaceTarget(connection, actualStart, planEnd, Number(plan.dailyPages || 1));
  const normalEnd = normalRange?.end || actualStart;

  let scheduledEnd;
  const officialStartDate = plan.startDate || null;
  const effectiveFrom = plan.effectiveFrom || officialStartDate;
  const scheduleBase = plan.scheduleAnchorPage && plan.scheduleAnchorSurah && plan.scheduleAnchorAyah
    ? { page: Number(plan.scheduleAnchorPage), surah: Number(plan.scheduleAnchorSurah), ayah: Number(plan.scheduleAnchorAyah) }
    : null;
  const scheduleStart = scheduleBase
    ? await getAdjacentQuranAyahInDirection(connection, scheduleBase, direction)
    : planStart;
  scheduledEnd = scheduleBase;
  const schedulePeriodStart = scheduleBase ? effectiveFrom : officialStartDate;
  scheduledEnd = await resolveScheduledPlanEnd({ officialStartDate, schedulePeriodStart, date, scheduleStart, plan, settings, connection, planEnd, scheduledEnd, scheduleBase });

  const furthestDue = scheduledEnd && compareQuranPositionInDirection(scheduledEnd, normalEnd, direction) > 0
    ? scheduledEnd
    : normalEnd;
  const extraStart = await getAdjacentQuranAyahInDirection(connection, furthestDue, direction);
  const extraRange = extraStart
    ? await buildQuranRangeByFaceTarget(connection, extraStart, planEnd, QURAN_EXTRA_FORWARD_FACES)
    : null;
  const extraEnd = extraRange?.end || furthestDue;
  const legacyMode = !officialStartDate;
  const allowedEnd = legacyMode ? extraEnd : getPlanExecutionLimit({
    normalEnd,
    scheduledEnd,
    extraEnd,
    direction,
    allowCompensation: settings.allowQuranCompensation,
    allowExtra: settings.allowQuranExtra,
  });
  return { actualStart, normalEnd, scheduledEnd, extraEnd, allowedEnd, direction, legacyMode };
}

/** Calculate the scheduled boundary only for valid active schedule dates. */
async function resolveScheduledPlanEnd({ officialStartDate, schedulePeriodStart, date, scheduleStart, plan, settings, connection, planEnd, scheduledEnd, scheduleBase }) {
  if (officialStartDate && schedulePeriodStart && date >= schedulePeriodStart && isValidQuranPosition(scheduleStart)) {
    const scheduledDays = (await planScheduleDates(connection, schedulePeriodStart, date, getStoredPlanScheduleDays(plan, settings))).length;
    if (scheduledDays > 0) {
      const scheduledRange = await buildQuranRangeByFaceTarget(
        connection,
        scheduleStart,
        planEnd,
        Math.max(0.25, scheduledDays * Number(plan.dailyPages || 1))
      );
      scheduledEnd = scheduledRange?.end || scheduleBase;
    }
  }
  return scheduledEnd;
}

async function getPlanProgressSummary(connection, context) {
  if (!context) return null;
  const delayed = context.scheduledEnd
    && compareQuranPositionInDirection(context.scheduledEnd, context.actualStart, context.direction) >= 0;
  const shortageFaces = delayed
    ? await calculateQuranRangeFaces(connection, {
      startPage: context.actualStart.page,
      startSurah: context.actualStart.surah,
      startAyah: context.actualStart.ayah,
      endPage: context.scheduledEnd.page,
      endSurah: context.scheduledEnd.surah,
      endAyah: context.scheduledEnd.ayah,
    })
    : 0;
  return {
    actualStart: context.actualStart,
    normalEnd: context.normalEnd,
    scheduledEnd: context.scheduledEnd,
    shortageFaces: delayed ? Math.max(0, Number(shortageFaces || 0)) : 0,
    isAhead: Boolean(context.scheduledEnd
      && compareQuranPositionInDirection(context.actualStart, context.scheduledEnd, context.direction) > 0),
  };
}

async function countMemorizedAyahsInRange(connection, ranges, start, end) {
  if (!isValidQuranPosition(start) || !isValidQuranPosition(end)) {
    return { totalAyahs: 0, memorizedAyahs: 0 };
  }
  const planRanges = await expandQuranTraversalRange(connection, {
    startSurah: start.surah,
    startAyah: start.ayah,
    startPage: start.page,
    endSurah: end.surah,
    endAyah: end.ayah,
    endPage: end.page,
  });
  const direction = getQuranRangeDirection(start, end);
  const ayahs = await getQuranAyahsInPageRange(connection, direction < 0 ? 1 : start.page, direction < 0 ? 604 : end.page);
  let totalAyahs = 0;
  let memorizedAyahs = 0;
  for (const ayah of ayahs) {
    if (!quranPositionInRanges(ayah, planRanges)) continue;
    totalAyahs += 1;
    if (quranPositionInRanges(ayah, ranges)) memorizedAyahs += 1;
  }
  return { totalAyahs, memorizedAyahs };
}

async function isLinkTaskWithinAcceptedMemorization(connection, task) {
  if (task?.taskType !== 'link') return true;
  const memorizedRanges = await getStudentMemorizedRanges(
    connection,
    task.studentId,
    { beforeDate: addUtcDays(task.taskDate, 1) },
  );
  const end = {
    page: Number(task.actualToPage || task.toPage),
    surah: Number(task.actualToSurah || task.toSurah),
    ayah: Number(task.actualToAyah || task.toAyah),
  };
  const coverage = await countMemorizedAyahsInRange(
    connection,
    memorizedRanges,
    taskStartPosition(task),
    end,
  );
  return coverage.totalAyahs > 0 && coverage.memorizedAyahs === coverage.totalAyahs;
}

async function getFullyMemorizedPages(connection, ranges, startPage, endPage) {
  if (!ranges.length) return new Set();
  const ayahs = await getQuranAyahsInPageRange(connection, startPage, endPage);
  const byPage = new Map();
  for (const ayah of ayahs) {
    const key = Number(ayah.page);
    if (!byPage.has(key)) byPage.set(key, { total: 0, memorized: 0 });
    const item = byPage.get(key);
    item.total += 1;
    if (quranPositionInRanges(ayah, ranges)) item.memorized += 1;
  }
  const pages = new Set();
  byPage.forEach((value, page) => {
    if (value.total > 0 && value.total === value.memorized) pages.add(Number(page));
  });
  return pages;
}

async function buildExactLinkRanges(connection, ranges, currentMemorizationStart, direction, targetFaces, { limitToTarget = false } = {}) {
  if (!ranges.length || !isValidQuranPosition(currentMemorizationStart)) return [];
  const ayahs = await getQuranAyahsInPageRange(connection, 1, 604);
  return selectExactQuranLinkRanges({ ayahs, ranges, current: currentMemorizationStart, direction, targetFaces, limitToTarget });
}

async function advancePlanAfterCompletedMemorization(connection, task) {
  const plan = await getActivePlanForStudent(connection, Number(task.studentId));
  if (plan) await recomputePlanMemorizationCursor(connection, plan);
}

function pagesToRanges(pages) {
  const sorted = [...new Set(pages.map(Number).filter(Boolean))].sort((a, b) => a - b);
  const ranges = [];
  for (const page of sorted) {
    const last = ranges.at(-1);
    if (last && page === last.toPage + 1) {
      last.toPage = page;
    } else {
      ranges.push({ fromPage: page, toPage: page });
    }
  }
  return ranges;
}

async function repairUnevaluatedRevisionTasks(
  connection,
  { planId, date, desiredLinkPages, allowedReviewPages, desiredLinkRanges = [], desiredReviewPageCount = null, desiredReviewPages = null },
) {
  if (date < getSaudiDateTimeParts().date) return { removedLink: false, removedReview: false };
  const [rows] = await connection.query(
    `SELECT
       t.id,
       t.task_type AS taskType,
       t.from_page AS fromPage,
       t.to_page AS toPage,
       t.from_surah AS fromSurah,
       t.from_ayah AS fromAyah,
       t.to_surah AS toSurah,
       t.to_ayah AS toAyah,
       t.student_id AS studentId,
       t.student_status AS studentStatus,
       t.execution_actor_role AS executionActorRole,
       t.executed_at AS executedAt, t.actual_to_page AS actualToPage, t.evaluated_at AS evaluatedAt,
       t.teacher_completed AS teacherCompleted,
       EXISTS (
         SELECT 1 FROM student_quran_recitation_attempts attempt WHERE attempt.task_id = t.id AND attempt.is_official = 1
       ) AS hasAttempt
     FROM student_quran_tasks t
     WHERE t.plan_id = ? AND t.task_date = ? AND t.task_type IN ('review', 'link')
       AND t.compensation_index = 0
     FOR UPDATE`,
    [planId, date],
  );
  const desiredLinkSet = new Set(desiredLinkPages.map(Number));
  const allowedReviewSet = new Set(allowedReviewPages.map(Number));
  const rowPages = (row) => {
    const pages = [];
    for (let page = Number(row.fromPage); page <= Number(row.toPage); page += 1) pages.push(page);
    return pages;
  };
  const safeToReplace = (row) => (
    row.teacherCompleted == null
    && row.studentStatus !== 'done'
    && row.executionActorRole !== 'teacher'
    && (row.taskType !== 'review' || (!row.executedAt && !row.actualToPage && !row.evaluatedAt && row.executionActorRole == null))
    && !Number(row.hasAttempt)
  );
  const linkRows = rows.filter((row) => row.taskType === 'link');
  const rowMatchesRange = (row, range) => (
    Number(row.fromPage) === Number(range.startPage)
    && Number(row.fromSurah) === Number(range.startSurah)
    && Number(row.fromAyah) === Number(range.startAyah)
    && Number(row.toPage) === Number(range.endPage)
    && Number(row.toSurah) === Number(range.endSurah)
    && Number(row.toAyah) === Number(range.endAyah)
  );
  const linkMatches = linkRows.length === desiredLinkRanges.length
    && desiredLinkRanges.every((range) => linkRows.some((row) => rowMatchesRange(row, range)));
  const removableLinkRows = !linkMatches && linkRows.every(safeToReplace) ? linkRows : [];
  const reviewRows = rows.filter((row) => row.taskType === 'review');
  const invalidReviewRows = reviewRows.filter((row) => rowPages(row).some((page) => (
    desiredLinkSet.has(page) || !allowedReviewSet.has(page)
  )));
  const currentReviewPageCount = new Set(reviewRows.flatMap(rowPages)).size;
  const reviewAmountChanged = desiredReviewPageCount !== null
    && reviewRows.length > 0
    && currentReviewPageCount !== Number(desiredReviewPageCount);
  const reviewRangeChanged = desiredReviewPages !== null && !reviewPagesMatch(reviewRows, desiredReviewPages);
  const removableReviewRows = (invalidReviewRows.length > 0 || reviewAmountChanged || reviewRangeChanged)
    && reviewRows.every(safeToReplace)
    ? reviewRows
    : [];
  const removableIds = [...removableLinkRows, ...removableReviewRows].map((row) => Number(row.id));
  if (removableIds.length) {
    await connection.query(
      `DELETE FROM student_quran_tasks WHERE id IN (${removableIds.map(() => '?').join(', ')})`,
      removableIds,
    );
  }
  return {
    removedLink: removableLinkRows.length > 0,
    removedReview: removableReviewRows.length > 0,
    reviewRestartPage: removableReviewRows.length
      ? Math.min(...removableReviewRows.flatMap(rowPages))
      : null,
  };
}

function pickAvailablePages(availablePages, startPage, count) {
  const sorted = [...availablePages].sort((a, b) => a - b);
  if (!sorted.length || count < 1) return { pages: [], nextReviewPage: startPage };
  const startIndex = sorted.findIndex((page) => page >= Number(startPage));
  const ordered = startIndex >= 0
    ? [...sorted.slice(startIndex), ...sorted.slice(0, startIndex)]
    : sorted;
  const picked = [];
  let segments = 0;
  for (const page of ordered) {
    const previous = picked.at(-1);
    const wrappedToStart = previous && page === sorted[0] && previous === sorted.at(-1);
    // A wrap or gap begins one new segment; never cross a second discontinuity.
    if (previous && (wrappedToStart || page !== previous + 1)) {
      segments += 1;
      if (segments > 1 || (!wrappedToStart && picked.length >= count)) break;
    }
    picked.push(page);
    if (picked.length >= count) break;
  }
  const lastPicked = picked.at(-1);
  const nextReviewPage = lastPicked
    ? (sorted.find((page) => page > lastPicked) || sorted[0])
    : (sorted[0] || startPage);
  return { pages: picked, nextReviewPage };
}

function formatTaskPreview(task, referenceMode = 'ayah') {
  if (!task) return '';
  if (referenceMode === 'page' && task.fromPage && task.toPage) {
    const samePage = Number(task.fromPage) === Number(task.toPage);
    const startLayout = getQuranVerseLine({ surah: task.fromSurah, ayah: task.fromAyah });
    const endLayout = getQuranVerseLine({ surah: task.toSurah, ayah: task.toAyah });
    const _resolvePartialLabel = () => {
      if (samePage && startLayout && endLayout) {
        if (endLayout.endLine <= 8) {
          return ' - النصف الأول';
        }
        if (startLayout.startLine >= 8) {
          return ' - النصف الثاني';
        }
        return '';
      }
      return '';
    };
    const partialLabel = _resolvePartialLabel();
    return samePage
      ? `الوجه ${task.fromPage}${partialLabel}`
      : `من ${task.fromPage} إلى ${task.toPage}`;
  }
  const hasAyahRange = task.fromSurah && task.fromAyah && task.toSurah && task.toAyah;
  const fromSurahName = task.fromSurahName || `سورة ${task.fromSurah}`;
  const toSurahName = task.toSurahName || `سورة ${task.toSurah}`;
  const _resolveLabel2 = () => {
    if (hasAyahRange) {
      if (Number(task.fromSurah) === Number(task.toSurah) && Number(task.fromAyah) === Number(task.toAyah)) {
        return `${fromSurahName} آية ${task.fromAyah}`;
      }
      if (Number(task.fromSurah) === Number(task.toSurah)) {
        return `${fromSurahName} آية ${task.fromAyah} إلى آية ${task.toAyah}`;
      }
      return `${fromSurahName} آية ${task.fromAyah} إلى ${toSurahName} آية ${task.toAyah}`;
    }
    return null;
  };
  const label = _resolveLabel2();
  return label || '';
}

function buildTaskRangePreview(row, referenceMode = 'ayah', endPrefix = 'to') {
  const _resolveToSurahName = () => {
    if (endPrefix === 'actualTo') {
      return row.actualToSurahName || (row.actualToSurah ? `سورة ${row.actualToSurah}` : row.toSurahName);
    }
    return row.toSurahName;
  };
  return formatTaskPreview({
    fromPage: row.fromPage,
    toPage: row[`${endPrefix}Page`],
    fromSurah: row.fromSurah,
    fromAyah: row.fromAyah,
    toSurah: row[`${endPrefix}Surah`],
    toAyah: row[`${endPrefix}Ayah`],
    fromSurahName: row.fromSurahName,
    toSurahName: _resolveToSurahName(),
  }, referenceMode);
}

async function insertPlanTask(connection, { plan, date, type, fromPage, toPage, targetPages = null, bounds = null, progress = null, hizbNumber = null, compensationIndex = 0 }) {
  if (!fromPage || !toPage) return;
  const direction = Number(fromPage) <= Number(toPage) ? 1 : -1;
  if (['memorization', 'repeat'].includes(type) && Number(fromPage) !== Number(toPage)) {
    const requestedFaces = roundQuranFaces(Number(targetPages || Math.abs(Number(toPage) - Number(fromPage)) + 1));
    const remainingFaces = requestedFaces;
    await insertSplitPlanPages({ fromPage, direction, toPage, connection, bounds, remainingFaces, plan, date, type, progress, compensationIndex });
    return;
  }
  const hasBounds = bounds?.fromSurah && bounds?.fromAyah && bounds?.toSurah && bounds?.toAyah;
  const taskDirection = ['memorization', 'repeat'].includes(type)
    ? getQuranRangeDirection(
      { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
      { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) }
    )
    : 1;
  const taskBounds = hasBounds ? bounds : await getTaskBoundsForPages(connection, plan, fromPage, toPage, taskDirection);
  if (!taskBounds) return;
  const calculatedFaces = await calculateQuranRangeFaces(connection, {
    startPage: fromPage,
    startSurah: taskBounds.fromSurah,
    startAyah: taskBounds.fromAyah,
    endPage: toPage,
    endSurah: taskBounds.toSurah,
    endAyah: taskBounds.toAyah,
  });
  const targetFaces = Number(targetPages || 0) > 0
    ? roundQuranFaces(targetPages)
    : calculatedFaces || Math.max(1, Math.abs(toPage - fromPage) + 1);
  await connection.query(
    `
    INSERT IGNORE INTO student_quran_tasks
      (plan_id, student_id, task_date, task_type, track, compensation_index, from_page, to_page, from_surah, from_ayah, to_surah, to_ayah, target_pages, normal_to_page, normal_to_surah, normal_to_ayah, scheduled_to_page, scheduled_to_surah, scheduled_to_ayah, hizb_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      plan.id,
      plan.studentId,
      date,
      type,
      normalizeQuranPlanTrack(plan.track),
      Math.max(0, Math.trunc(Number(compensationIndex || 0))),
      fromPage,
      toPage,
      taskBounds.fromSurah,
      taskBounds.fromAyah,
      taskBounds.toSurah,
      taskBounds.toAyah,
      targetFaces,
      progress?.normalEnd?.page || null,
      progress?.normalEnd?.surah || null,
      progress?.normalEnd?.ayah || null,
      progress?.scheduledEnd?.page || null,
      progress?.scheduledEnd?.surah || null,
      progress?.scheduledEnd?.ayah || null,
      type === 'review' && hizbNumber ? Number(hizbNumber) : null,
    ]
  );
}

/** Split a multi-page task into bounded page tasks while preserving its total face allowance. */
async function insertSplitPlanPages({ fromPage, direction, toPage, connection, bounds, remainingFaces, plan, date, type, progress, compensationIndex = 0 }) {
  for (let page = Number(fromPage);direction > 0 ? page <= Number(toPage) : page >= Number(toPage);page += direction) {
    const pageBoundary = await getQuranPageBoundaryInDirection(connection, page, direction);
    if (!pageBoundary) continue;
    const pageBounds = getSplitPageBounds(page, fromPage, bounds, pageBoundary, toPage);
    const calculatedPageFaces = await calculateQuranRangeFaces(connection, {
      startPage: page,
      startSurah: pageBounds.fromSurah,
      startAyah: pageBounds.fromAyah,
      endPage: page,
      endSurah: pageBounds.toSurah,
      endAyah: pageBounds.toAyah,
    });
    const isLastPage = page === Number(toPage);
    const pageTargetFaces = isLastPage
      ? Math.max(0.25, remainingFaces)
      : Math.min(remainingFaces, Math.max(0.25, calculatedPageFaces || 1));
    await insertPlanTask(connection, {
      plan, date, type, fromPage: page, toPage: page, targetPages: pageTargetFaces, bounds: {
        ...pageBounds,
      }, progress, compensationIndex
    });
    remainingFaces = Math.max(0, roundQuranFaces(remainingFaces - pageTargetFaces));
  }
  return remainingFaces;
}

/** Clip the first and last page to the requested Quran positions. */
function getSplitPageBounds(page, fromPage, bounds, pageBoundary, toPage) {
  return {
    fromSurah: page === Number(fromPage) && bounds?.fromSurah
      ? bounds.fromSurah
      : pageBoundary.start.surah,
    fromAyah: page === Number(fromPage) && bounds?.fromAyah
      ? bounds.fromAyah
      : pageBoundary.start.ayah,
    toSurah: page === Number(toPage) && bounds?.toSurah
      ? bounds.toSurah
      : pageBoundary.end.surah,
    toAyah: page === Number(toPage) && bounds?.toAyah
      ? bounds.toAyah
      : pageBoundary.end.ayah,
  };
}

async function splitUnevaluatedPlanTasksByFace(connection, plan, date) {
  const [rows] = await connection.query(
    `
    SELECT
      id,
      task_type AS taskType,
      track,
      from_page AS fromPage,
      to_page AS toPage,
      from_surah AS fromSurah,
      from_ayah AS fromAyah,
      to_surah AS toSurah,
      to_ayah AS toAyah,
      actual_to_page AS actualToPage,
      actual_to_surah AS actualToSurah,
      actual_to_ayah AS actualToAyah,
      execution_state AS executionState,
      student_status AS studentStatus
    FROM student_quran_tasks
    WHERE plan_id = ? AND task_date = ?
      AND task_type IN ('memorization', 'repeat')
      AND from_page <> to_page
      AND teacher_completed IS NULL
      AND compensation_index = 0
    FOR UPDATE
    `,
    [plan.id, date]
  );

  for (const row of rows) {
    const direction = Number(row.fromPage) <= Number(row.toPage) ? 1 : -1;
    await insertPlanTask(connection, { plan, date, type: row.taskType, fromPage: row.fromPage, toPage: row.toPage, targetPages: null, bounds: {
      fromSurah: row.fromSurah,
      fromAyah: row.fromAyah,
      toSurah: row.toSurah,
      toAyah: row.toAyah,
    } });
    await copySplitExecutionState(row, direction, connection, plan, date);
    await connection.query('DELETE FROM student_quran_tasks WHERE id = ?', [row.id]);
  }
}

/** Copy execution markers onto split pages without modifying evaluated tasks. */
async function copySplitExecutionState(row, direction, connection, plan, date) {
  for (let page = Number(row.fromPage);direction > 0 ? page <= Number(row.toPage) : page >= Number(row.toPage);page += direction) {
    const boundary = await getQuranPageBoundaryInDirection(connection, page, direction);
    if (!boundary) continue;
    const actualPage = Number(row.actualToPage || 0);
    const pageCompleted = row.studentStatus === 'done' && (!actualPage || (direction > 0 ? page <= actualPage : page >= actualPage));
    const isActualPage = pageCompleted && actualPage === page;
    const _resolveConditional = () => {
      if (pageCompleted) {
        return 'done';
      }
      if (row.studentStatus === 'done') {
        return 'not_done';
      }
      return row.studentStatus;
    };
    const _resolveConditional2 = () => {
      if (pageCompleted) {
        if (isActualPage && row.actualToSurah) {
          return row.actualToSurah;
        }
        return boundary.end.surah;
      }
      return null;
    };
    const _resolveConditional3 = () => {
      if (pageCompleted) {
        if (isActualPage && row.actualToAyah) {
          return row.actualToAyah;
        }
        return boundary.end.ayah;
      }
      return null;
    };
    const _resolveConditional4 = () => {
      if (pageCompleted) {
        if (isActualPage) {
          return row.executionState;
        }
        return 'complete';
      }
      return null;
    };
    await connection.query(
      `
        UPDATE student_quran_tasks
        SET student_status = ?,
            actual_to_page = ?,
            actual_to_surah = ?,
            actual_to_ayah = ?,
            execution_state = ?
        WHERE plan_id = ? AND task_date = ? AND task_type = ? AND from_page = ? AND to_page = ?
        `,
      [
        _resolveConditional(),
        pageCompleted ? page : null,
        _resolveConditional2(),
        _resolveConditional3(),
        _resolveConditional4(),
        plan.id,
        date,
        row.taskType,
        page,
        page,
      ]
    );
  }
}

async function ensureRepeatTasksForMemorizationDate(connection, plan, date) {
  const [rows] = await connection.query(
    `
    SELECT
      m.track, m.from_page AS fromPage,
      m.to_page AS toPage,
      m.from_surah AS fromSurah,
      m.from_ayah AS fromAyah,
      m.to_surah AS toSurah,
      m.to_ayah AS toAyah,
      m.target_pages AS targetPages
    FROM student_quran_tasks m
    WHERE m.plan_id = ?
      AND m.task_date = ?
      AND m.task_type = 'memorization'
      AND m.compensation_index = 0
      AND NOT EXISTS (
        SELECT 1
        FROM student_quran_tasks r
        WHERE r.plan_id = m.plan_id
          AND r.task_date = m.task_date
          AND r.task_type = 'repeat' AND r.track = m.track
          AND r.from_page = m.from_page
          AND r.to_page = m.to_page
          AND COALESCE(r.from_surah, 0) = COALESCE(m.from_surah, 0)
          AND COALESCE(r.from_ayah, 0) = COALESCE(m.from_ayah, 0)
          AND COALESCE(r.to_surah, 0) = COALESCE(m.to_surah, 0)
          AND COALESCE(r.to_ayah, 0) = COALESCE(m.to_ayah, 0)
      )
    ORDER BY m.from_page ASC
    `,
    [plan.id, date]
  );

  for (const task of rows) {
    await insertPlanTask(connection, { plan: { ...plan, track: task.track }, date, type: 'repeat', fromPage: task.fromPage, toPage: task.toPage, targetPages: task.targetPages, bounds: {
      fromSurah: task.fromSurah,
      fromAyah: task.fromAyah,
      toSurah: task.toSurah,
      toAyah: task.toAyah,
    } });
  }
}

async function repairUnevaluatedMemorizationTaskRange(connection, plan, date, settings, nextUnmemorized) {
  const [rows] = await connection.query(
    `
    SELECT
      t.id,
      t.task_type AS taskType,
      t.from_page AS fromPage,
      t.from_surah AS fromSurah,
      t.from_ayah AS fromAyah,
      t.to_page AS toPage,
      t.to_surah AS toSurah,
      t.to_ayah AS toAyah,
      t.student_status AS studentStatus,
      t.teacher_completed AS teacherCompleted,
      EXISTS (
        SELECT 1 FROM student_quran_recitation_attempts attempt
        WHERE attempt.task_id = t.id AND attempt.is_official = 1
      ) AS hasAttempt
    FROM student_quran_tasks t
    WHERE t.plan_id = ?
      AND t.task_date = ?
      AND t.task_type IN ('memorization', 'repeat')
      AND t.compensation_index = 0
    FOR UPDATE
    `,
    [plan.id, date],
  );
  const memorizationRows = rows.filter((row) => row.taskType === 'memorization');
  if (!memorizationRows.length) return false;
  const safeToRepair = rows.every((row) => (
    row.teacherCompleted == null
    && row.studentStatus !== 'done'
    && !Number(row.hasAttempt)
  ));
  if (!safeToRepair) return false;

  const direction = getQuranRangeDirection(
    { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
    { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) },
  );
  const ordered = [...memorizationRows].sort((first, second) => compareQuranPositionInDirection(
    { page: Number(first.fromPage), surah: Number(first.fromSurah), ayah: Number(first.fromAyah) },
    { page: Number(second.fromPage), surah: Number(second.fromSurah), ayah: Number(second.fromAyah) },
    direction,
  ));
  const first = ordered[0];
  const last = ordered.at(-1);
  const currentStart = { page: Number(first.fromPage), surah: Number(first.fromSurah), ayah: Number(first.fromAyah) };
  const currentEnd = { page: Number(last.toPage), surah: Number(last.toSurah), ayah: Number(last.toAyah) };
  const progressContext = await getPlanProgressContext(connection, plan, date, settings, currentStart);
  const startsAfterGap = nextUnmemorized
    && compareQuranPositionInDirection(currentStart, nextUnmemorized, direction) > 0;
  if (!startsAfterGap && (!progressContext || compareQuranPositionInDirection(currentEnd, progressContext.normalEnd, direction) === 0)) return false;

  await connection.query(
    `DELETE t FROM student_quran_tasks t
     WHERE t.plan_id = ?
       AND t.task_date = ?
       AND t.task_type IN ('memorization', 'repeat')
       AND t.teacher_completed IS NULL
       AND COALESCE(t.student_status, 'not_done') <> 'done'
       AND NOT EXISTS (
         SELECT 1 FROM student_quran_recitation_attempts attempt
         WHERE attempt.task_id = t.id AND attempt.is_official = 1
       )`,
    [plan.id, date],
  );
  return true;
}

async function ensureStudentPlanTasks(connection, plan, date, settings) {
  if (!canContinueQuranRevision(plan)) return [];
  const effectiveStartDate = plan.startDate || plan.createdDate;
  if (effectiveStartDate && date < effectiveStartDate) return [];

  const nextUnmemorized = await getNextUnmemorizedPlanPosition(connection, plan, { beforeDate: date });
  await repairUnevaluatedMemorizationTaskRange(connection, plan, date, settings, nextUnmemorized);
  await splitUnevaluatedPlanTasksByFace(connection, plan, date);

  const [existing] = await connection.query(
    'SELECT task_type AS taskType, target_pages AS targetPages FROM student_quran_tasks WHERE plan_id = ? AND task_date = ? AND compensation_index = 0',
    [plan.id, date]
  );
  const existingTypes = new Set(existing.map((task) => task.taskType));
  const dailyMemorizationFaces = Math.max(0.25, Number(plan.dailyPages || 1));
  let scheduledMemorizationFaces = existing
    .filter((task) => task.taskType === 'memorization')
    .reduce((total, task) => total + Math.max(0.25, Number(task.targetPages || 0)), 0);
  let lastCarriedMemorizationEnd = null;

  const [unfinishedRows] = await connection.query(
    `
    SELECT
      task_type AS taskType,
      track AS track,
      from_page AS fromPage,
      to_page AS toPage,
      from_surah AS fromSurah,
      from_ayah AS fromAyah,
      to_surah AS toSurah,
      to_ayah AS toAyah,
      target_pages AS targetPages,
      teacher_completed AS teacherCompleted
    FROM student_quran_tasks
    WHERE plan_id = ?
      AND task_date < ?
      AND task_type IN ('memorization', 'review', 'link')
      AND compensation_index = 0
      AND (
        student_status = 'pending'
        OR (student_status = 'not_done' AND COALESCE(execution_state, '') <> 'partial')
        OR teacher_completed = 0
      )
      AND NOT EXISTS (
        SELECT 1
        FROM student_quran_tasks newer
        WHERE newer.plan_id = student_quran_tasks.plan_id
          AND newer.task_date < ?
          AND newer.task_date > student_quran_tasks.task_date
          AND newer.from_page = student_quran_tasks.from_page
          AND newer.to_page = student_quran_tasks.to_page
          AND COALESCE(newer.from_surah, 0) = COALESCE(student_quran_tasks.from_surah, 0)
          AND COALESCE(newer.from_ayah, 0) = COALESCE(student_quran_tasks.from_ayah, 0)
          AND COALESCE(newer.to_surah, 0) = COALESCE(student_quran_tasks.to_surah, 0)
          AND COALESCE(newer.to_ayah, 0) = COALESCE(student_quran_tasks.to_ayah, 0)
      )
    ORDER BY task_date ASC, from_page ASC
    LIMIT 20
    `,
    [plan.id, date, date]
  );

  const carriedTypes = new Set();
  ({ lastCarriedMemorizationEnd, scheduledMemorizationFaces } = await carryUnfinishedPlanTasks({ unfinishedRows, lastCarriedMemorizationEnd, connection, plan, nextUnmemorized, existingTypes, carriedTypes, scheduledMemorizationFaces, settings, date, dailyMemorizationFaces }));
  if (scheduledMemorizationFaces > 0) carriedTypes.add('memorization');
  carriedTypes.forEach((type) => existingTypes.add(type));

  const priorRanges = await getPriorMemorizationRanges(connection, plan.id);
  const startPage = Number(plan.startPage);
  const endPage = Number(plan.endPage);
  const planStart = { page: startPage, surah: Number(plan.startSurah), ayah: Number(plan.startAyah) };
  const planEnd = { page: endPage, surah: Number(plan.endSurah), ayah: Number(plan.endAyah) };
  const direction = getQuranRangeDirection(planStart, planEnd);
  const fullyPriorPages = await getFullyMemorizedPages(connection, priorRanges, 1, 604);
  let memorizationStart = nextUnmemorized;
  memorizationStart = memorizationStart
    ? await skipFullyMemorizedTraversalPages(connection, memorizationStart, planEnd, direction, fullyPriorPages)
    : null;
  memorizationStart = await resumeAfterCarriedMemorization({ lastCarriedMemorizationEnd, connection, direction, memorizationStart, planEnd, fullyPriorPages });

  await refreshPendingMemorizationProgress({ existingTypes, connection, plan, date, memorizationStart, settings });

  const remainingMemorizationFaces = roundQuranFaces(Math.max(0, dailyMemorizationFaces - scheduledMemorizationFaces));
  await createRemainingMemorizationTasks({ remainingMemorizationFaces, settings, date, memorizationStart, connection, plan, planEnd, existingTypes });

  await ensureRepeatTasksForMemorizationDate(connection, plan, date);

  const memorizedRangesForReview = await getStudentMemorizedRanges(connection, plan.studentId, {
    beforeDate: date,
  });
  const availablePages = await getFullyMemorizedPages(connection, memorizedRangesForReview, 1, 604);
  // Keep the day's revision based on earlier accepted work. Accepting today's
  // memorization must not replace the review/link that the teacher already saw.
  const memorizedThroughToday = memorizedRangesForReview;
  const linkStart = await getNextUnmemorizedPlanPosition(connection, plan, { beforeDate: addUtcDays(date, 1) })
    || await getAdjacentQuranAyahInDirection(connection, planEnd, direction)
    || { ...planEnd, ayah: Number(planEnd.ayah) + 1 };
  const exactLinkRanges = await buildExactLinkRanges(
    connection,
    memorizedThroughToday,
    linkStart,
    direction,
    plan.linkPages || 10,
  );
  const exactLinkPages = [...new Set(exactLinkRanges.flatMap((range) => Array.from(
    { length: Math.abs(Number(range.endPage) - Number(range.startPage)) + 1 },
    (_, index) => Math.min(Number(range.startPage), Number(range.endPage)) + index,
  )))];
  const exactLinkPageSet = new Set(exactLinkPages);
  const revisionPages = buildRevisionPageSets(exactLinkPages, availablePages, exactLinkPageSet, direction);
  const reviewDays = getPlanReviewDays(plan, settings);
  const splitReview = Boolean(Number(plan.reviewSplitWeekly || 0));
  const canReviewToday = !splitReview || reviewDays.includes(getWeekDayFromDate(date));
  const reviewEnabledToday = canReviewToday && canCreateQuranTaskOnDate(settings, date, 'review');
  const targetReviewPages = splitReview
    ? calculateWeeklyReviewDailyPages({
      availableReviewPages: revisionPages.review.length,
      reviewDays: reviewDays.length,
      minimumDailyPages: plan.reviewMinDailyPages,
    })
    : Number(plan.reviewPages || 20);
  // Missed review days are added to today's review so the cycle simply continues further.
  const reviewCompensationDays = reviewEnabledToday && date >= getSaudiDateTimeParts().date
    ? await getOwedRevisionCompensationDays(connection, plan, date, settings, 'review')
    : 0;
  const compensatedReviewPages = targetReviewPages * (1 + reviewCompensationDays);
  const reviewStartPage = await getReviewStartForDate(connection, plan, date);
  const pickedReview = splitReview
    ? pickAvailablePages(new Set(revisionPages.review), reviewStartPage, compensatedReviewPages)
    : pickReviewPagesByHizbs(new Set(revisionPages.review), reviewStartPage, (plan.reviewHizbs || 1) * (1 + reviewCompensationDays));
  const repairedRevisionTasks = await repairUnevaluatedRevisionTasks(
    connection,
    { planId: plan.id, date, desiredLinkPages: revisionPages.linking, allowedReviewPages: revisionPages.review, desiredLinkRanges: exactLinkRanges, desiredReviewPageCount: splitReview && reviewEnabledToday ? compensatedReviewPages : null, desiredReviewPages: date >= getSaudiDateTimeParts().date && reviewEnabledToday ? pickedReview.pages : null },
  );
  if (repairedRevisionTasks.removedLink) existingTypes.delete('link');
  if (repairedRevisionTasks.removedReview) existingTypes.delete('review');
  await createMissingLinkTasks({ exactLinkRanges, existingTypes, settings, date, connection, plan });

  const createdReview = !existingTypes.has('review');
  await createMissingReviewTasks({ existingTypes, reviewEnabledToday, pickedReview, connection, plan, date });
  if (createdReview && reviewCompensationDays > 0) {
    // Credit only the days the added amount actually covers.
    const coveredDays = splitReview
      ? Math.floor(pickedReview.pages.length / Math.max(1, targetReviewPages)) - 1
      : Math.floor((pickedReview.hizbs || []).length / Math.max(1, Number(plan.reviewHizbs || 1))) - 1;
    await connection.query(
      `UPDATE student_quran_tasks SET compensation_days = ?
       WHERE plan_id = ? AND task_date = ? AND task_type = 'review' AND compensation_index = 0
       ORDER BY id ASC LIMIT 1`,
      [Math.min(reviewCompensationDays, Math.max(0, coveredDays)), plan.id, date],
    );
  }
}

const ACCEPTED_QURAN_TASK_SQL = "(teacher_completed = 1 OR (teacher_completed IS NULL AND student_status = 'done'))";

/** Link or review days due since the plan started that neither the day's task nor a compensation covered. */
async function getOwedRevisionCompensationDays(connection, plan, date, settings, taskType) {
  if (!settings?.allowQuranCompensation || !plan?.startDate || !canContinueQuranRevision(plan)) return 0;
  if (taskType === 'link' && Number(plan.linkPages || 0) <= 0) return 0;
  // Count only from the first day this task type existed, so a plan with nothing
  // memorized yet does not owe link or review for its opening days.
  const [[first]] = await connection.query(
    `SELECT DATE_FORMAT(MIN(task_date), '%Y-%m-%d') AS firstDate FROM student_quran_tasks
     WHERE plan_id = ? AND task_type = ? AND compensation_index = 0 AND task_date < ?`,
    [plan.id, taskType, date],
  );
  const fromDate = first?.firstDate && first.firstDate > plan.startDate ? first.firstDate : plan.startDate;
  const endDate = addUtcDays(date, -1);
  if (!first?.firstDate || fromDate > endDate) return 0;
  const scheduleDates = new Set(await planScheduleDates(connection, fromDate, endDate, getStoredPlanScheduleDays(plan, settings)));
  const reviewDays = taskType === 'review' && Number(plan.reviewSplitWeekly || 0)
    ? new Set(getPlanReviewDays(plan, settings))
    : null;
  const dueDates = new Set();
  for (let day = fromDate; day <= endDate; day = addUtcDays(day, 1)) {
    const weekDay = getWeekDayFromDate(day);
    if (!scheduleDates.has(day) || (reviewDays && !reviewDays.has(weekDay))) continue;
    dueDates.add(day);
  }
  if (!dueDates.size) return 0;
  const [rows] = await connection.query(
    `SELECT DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate, compensation_index AS compensationIndex,
       MAX(compensation_days) AS compensationDays
     FROM student_quran_tasks
     WHERE plan_id = ? AND task_type = ? AND task_date >= ? AND task_date <= ? AND ${ACCEPTED_QURAN_TASK_SQL}
     GROUP BY task_date, compensation_index`,
    [plan.id, taskType, fromDate, date],
  );
  let covered = 0;
  for (const row of rows) {
    if (Number(row.compensationIndex) > 0) covered += 1;
    else {
      if (dueDates.has(row.taskDate)) covered += 1;
      covered += Number(row.compensationDays || 0);
    }
  }
  return Math.max(0, dueDates.size - covered);
}

function quranTaskEnd(row) {
  return {
    page: Number(row.actualToPage || row.toPage),
    surah: Number(row.actualToSurah || row.toSurah),
    ayah: Number(row.actualToAyah || row.toAyah),
  };
}

async function loadCompensationDayRows(connection, plan, date, taskType) {
  const [rows] = await connection.query(
    `SELECT id, compensation_index AS compensationIndex, track,
       from_page AS fromPage, from_surah AS fromSurah, from_ayah AS fromAyah,
       to_page AS toPage, to_surah AS toSurah, to_ayah AS toAyah,
       actual_to_page AS actualToPage, actual_to_surah AS actualToSurah, actual_to_ayah AS actualToAyah,
       target_pages AS targetPages, student_status AS studentStatus, teacher_completed AS teacherCompleted,
       evaluated_at AS evaluatedAt, compensation_days AS compensationDays
     FROM student_quran_tasks
     WHERE plan_id = ? AND task_date = ? AND task_type = ?
     ORDER BY compensation_index ASC, id ASC`,
    [plan.id, date, taskType],
  );
  return rows;
}

const isAcceptedQuranTaskRow = (row) => Number(row.teacherCompleted) === 1
  || (row.teacherCompleted == null && row.studentStatus === 'done');

/** Group compensation rows by their index; a group is pending until the teacher accepts all of it. */
function summarizeCompensationGroups(rows) {
  const groups = new Map();
  for (const row of rows.filter((item) => Number(item.compensationIndex) > 0)) {
    const key = Number(row.compensationIndex);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].map(([index, groupRows]) => ({
    index,
    rows: groupRows,
    accepted: groupRows.every((row) => Number(row.teacherCompleted) === 1),
  }));
}

/** Memorization compensation: consecutive daily amounts after today's recitation up to the plan schedule. */
async function getMemorizationCompensationState(connection, plan, date, settings) {
  const rows = await loadCompensationDayRows(connection, plan, date, 'memorization');
  const regular = rows.filter((row) => Number(row.compensationIndex) === 0);
  const groups = summarizeCompensationGroups(rows);
  const state = { items: [], done: groups.filter((group) => group.accepted).length, pending: groups.find((group) => !group.accepted) || null, blocked: null, nextIndex: Math.max(0, ...groups.map((group) => group.index)) + 1 };
  if (!settings?.allowQuranCompensation || !plan?.startDate) return state;
  if (!regular.length) return { ...state, blocked: 'لا يوجد حفظ لهذا اليوم.' };
  const planStart = { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) };
  const planEnd = { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) };
  const direction = getQuranRangeDirection(planStart, planEnd);
  const byStart = [...regular].sort((a, b) => compareQuranPositionInDirection(taskStartPosition(a), taskStartPosition(b), direction));
  const context = await getPlanProgressContext(connection, plan, date, settings, taskStartPosition(byStart[0]));
  const scheduledEnd = context?.scheduledEnd;
  if (!scheduledEnd) return state;
  const lastEnd = rows.map(quranTaskEnd)
    .sort((a, b) => compareQuranPositionInDirection(a, b, direction)).at(-1);
  const dailyFaces = Math.max(0.25, Number(plan.dailyPages || 1));
  let cursor = await getAdjacentQuranAyahInDirection(connection, lastEnd, direction);
  while (cursor && compareQuranPositionInDirection(cursor, scheduledEnd, direction) <= 0 && state.items.length < 60) {
    const range = await buildQuranRangeByFaceTarget(connection, cursor, scheduledEnd, dailyFaces);
    if (!range?.end) break;
    state.items.push({
      fromPage: cursor.page, fromSurah: cursor.surah, fromAyah: cursor.ayah,
      toPage: range.end.page, toSurah: range.end.surah, toAyah: range.end.ayah,
      targetPages: roundQuranFaces(await calculateQuranRangeFaces(connection, {
        startPage: cursor.page, startSurah: cursor.surah, startAyah: cursor.ayah,
        endPage: range.end.page, endSurah: range.end.surah, endAyah: range.end.ayah,
      }) || dailyFaces),
    });
    cursor = await getAdjacentQuranAyahInDirection(connection, range.end, direction);
  }
  if (!regular.every((row) => Number(row.teacherCompleted) === 1)) {
    state.blocked = 'سمّع حفظ اليوم أولاً، ثم يبدأ التعويض بعده.';
  }
  return state;
}

/** Link compensation: the day's link recited again once per missed link day. */
async function getLinkCompensationState(connection, plan, date, settings) {
  const rows = await loadCompensationDayRows(connection, plan, date, 'link');
  const regular = rows.filter((row) => Number(row.compensationIndex) === 0);
  const groups = summarizeCompensationGroups(rows);
  const owed = await getOwedRevisionCompensationDays(connection, plan, date, settings, 'link');
  const state = { owed, ranges: regular, done: groups.filter((group) => group.accepted).length, pending: groups.find((group) => !group.accepted) || null, blocked: null, nextIndex: Math.max(0, ...groups.map((group) => group.index)) + 1 };
  if (!owed) return state;
  if (!regular.length) return { ...state, blocked: 'لا يوجد ربط لهذا اليوم.' };
  if (!regular.every((row) => Number(row.teacherCompleted) === 1)) {
    state.blocked = 'سمّع ربط اليوم أولاً، ثم يكرره للتعويض.';
  }
  return state;
}

async function getReviewCompensationState(connection, plan, date, settings) {
  const rows = await loadCompensationDayRows(connection, plan, date, 'review');
  const regular = rows.filter((row) => Number(row.compensationIndex) === 0);
  const addedDays = regular.reduce((max, row) => Math.max(max, Number(row.compensationDays || 0)), 0);
  const owed = await getOwedRevisionCompensationDays(connection, plan, date, settings, 'review');
  return { owed, addedDays, accepted: regular.length > 0 && regular.every(isAcceptedQuranTaskRow) };
}

/** Resume immediately after carried work while skipping only fully memorized pages. */
async function resumeAfterCarriedMemorization({ lastCarriedMemorizationEnd, connection, direction, memorizationStart, planEnd, fullyPriorPages }) {
  if (lastCarriedMemorizationEnd) {
    const afterCarried = await getAdjacentQuranAyahInDirection(connection, lastCarriedMemorizationEnd, direction);
    memorizationStart = afterCarried
      ? await skipFullyMemorizedTraversalPages(connection, afterCarried, planEnd, direction, fullyPriorPages)
      : null;
  }
  return memorizationStart;
}

/** Keep exact linking pages separate from the directionally ordered review pages. */
function buildRevisionPageSets(exactLinkPages, availablePages, exactLinkPageSet, direction) {
  return {
    linking: exactLinkPages,
    review: [...availablePages]
      .filter((page) => !exactLinkPageSet.has(Number(page)))
      .sort((first, second) => Number(direction) < 0 ? second - first : first - second),
  };
}

/** Create missing review ranges and advance the review cursor atomically. */
async function createMissingReviewTasks({ existingTypes, reviewEnabledToday, pickedReview, connection, plan, date }) {
  if (!existingTypes.has('review') && reviewEnabledToday) {
    const reviewRanges = splitPageRangesByHizb(pagesToRanges(pickedReview.pages));
    if (reviewRanges.length > 0) {
      for (const range of reviewRanges) {
        const rangePages = range.toPage - range.fromPage + 1;
        await insertPlanTask(
          connection,
          { plan, date, type: 'review', fromPage: range.fromPage, toPage: range.toPage, targetPages: rangePages, hizbNumber: range.hizb }
        );
      }
      await connection.query('UPDATE student_quran_plans SET next_review_page = ? WHERE id = ?', [pickedReview.nextReviewPage, plan.id]);
      existingTypes.add('review');
    }
  }
}

/** Create missing link ranges within the caller transaction using bound task values. */
async function createMissingLinkTasks({ exactLinkRanges, existingTypes, settings, date, connection, plan }) {
  if (exactLinkRanges.length > 0 && !existingTypes.has('link') && canCreateQuranTaskOnDate(settings, date, 'link')) {
    for (const range of exactLinkRanges) {
      await insertPlanTask(
        connection,
        {
          plan, date, type: 'link', fromPage: range.startPage, toPage: range.endPage, targetPages: range.faces, bounds: {
            fromSurah: range.startSurah,
            fromAyah: range.startAyah,
            toSurah: range.endSurah,
            toAyah: range.endAyah,
          }
        }
      );
    }
    existingTypes.add('link');
  }
}

/** Refresh schedule bounds only for untouched memorization tasks with bound plan and date parameters. */
async function refreshPendingMemorizationProgress({ existingTypes, connection, plan, date, memorizationStart, settings }) {
  if (existingTypes.has('memorization')) {
    const [[currentMemorization]] = await connection.query(
      `SELECT from_page AS fromPage, from_surah AS fromSurah, from_ayah AS fromAyah
       FROM student_quran_tasks
       WHERE plan_id = ? AND task_date = ? AND task_type = 'memorization' AND compensation_index = 0
       ORDER BY id ASC LIMIT 1`,
      [plan.id, date]
    );
    const currentStart = currentMemorization
      ? { page: Number(currentMemorization.fromPage), surah: Number(currentMemorization.fromSurah), ayah: Number(currentMemorization.fromAyah) }
      : memorizationStart;
    const progressContext = currentStart
      ? await getPlanProgressContext(connection, plan, date, settings, currentStart)
      : null;
    if (progressContext) {
      await connection.query(
        `UPDATE student_quran_tasks
         SET normal_to_page = ?, normal_to_surah = ?, normal_to_ayah = ?,
             scheduled_to_page = ?, scheduled_to_surah = ?, scheduled_to_ayah = ?
         WHERE plan_id = ? AND task_date = ? AND task_type = 'memorization' AND compensation_index = 0
           AND student_status <> 'done' AND teacher_completed IS NULL
           AND executed_at IS NULL AND evaluated_at IS NULL`,
        [
          progressContext.normalEnd.page,
          progressContext.normalEnd.surah,
          progressContext.normalEnd.ayah,
          progressContext.scheduledEnd?.page || null,
          progressContext.scheduledEnd?.surah || null,
          progressContext.scheduledEnd?.ayah || null,
          plan.id,
          date,
        ]
      );
    }
  }
}

/** Create only the unfilled daily memorization range and its paired repetition tasks. */
async function createRemainingMemorizationTasks({ remainingMemorizationFaces, settings, date, memorizationStart, connection, plan, planEnd, existingTypes }) {
  if (remainingMemorizationFaces > 0 && canCreateQuranTaskOnDate(settings, date, 'memorization') && memorizationStart) {
    const progressContext = await getPlanProgressContext(connection, plan, date, settings, memorizationStart);
    const remainingRange = await buildQuranRangeByFaceTarget(
      connection,
      memorizationStart,
      planEnd,
      remainingMemorizationFaces
    );
    const taskRange = progressContext && remainingRange
      ? { start: memorizationStart, end: remainingRange.end, faces: remainingRange.faces }
      : null;
    if (taskRange) {
      const taskSegments = taskRange.segments?.length
        ? taskRange.segments
        : [{ start: taskRange.start, end: taskRange.end, faces: taskRange.faces }];
      for (const segment of taskSegments) {
        const segmentBounds = {
          fromSurah: segment.start.surah,
          fromAyah: segment.start.ayah,
          toSurah: segment.end.surah,
          toAyah: segment.end.ayah,
        };
        await insertPlanTask(connection, { plan, date, type: 'memorization', fromPage: segment.start.page, toPage: segment.end.page, targetPages: segment.faces, bounds: segmentBounds, progress: progressContext });
        await insertPlanTask(connection, { plan, date, type: 'repeat', fromPage: segment.start.page, toPage: segment.end.page, targetPages: segment.faces, bounds: segmentBounds });
      }
    }
    existingTypes.add('memorization');
    existingTypes.add('repeat');
  }
}

/** Carry only eligible untouched work, preserving the exact memorization cursor and daily allowance. */
async function carryUnfinishedPlanTasks({ unfinishedRows, lastCarriedMemorizationEnd, connection, plan, nextUnmemorized, existingTypes, carriedTypes, scheduledMemorizationFaces, settings, date, dailyMemorizationFaces }) {
  for (const task of unfinishedRows) {
    const isMemorization = task.taskType === 'memorization';
    if (!await isNextCarriedMemorization({ isMemorization, lastCarriedMemorizationEnd, connection, plan, nextUnmemorized, task })) continue;
    if ((!isMemorization && (existingTypes.has(task.taskType) || carriedTypes.has(task.taskType)))
      || (isMemorization && existingTypes.has('memorization') && scheduledMemorizationFaces > 0)) continue;
    if (!canCreateQuranTaskOnDate(settings, date, task.taskType)) continue;
    const taskFaces = Math.max(0.25, Number(task.targetPages || 0));
    if (isMemorization
      && scheduledMemorizationFaces > 0
      && scheduledMemorizationFaces + taskFaces > dailyMemorizationFaces) continue;
    await insertPlanTask(connection, {
      plan, date, type: task.taskType, fromPage: task.fromPage, toPage: task.toPage, targetPages: task.targetPages, bounds: {
        fromSurah: task.fromSurah,
        fromAyah: task.fromAyah,
        toSurah: task.toSurah,
        toAyah: task.toAyah,
      }
    });
    await markCarriedTaskForRetry(task, connection, plan, date);
    if (isMemorization) {
      scheduledMemorizationFaces += taskFaces;
      lastCarriedMemorizationEnd = {
        page: Number(task.toPage),
        surah: Number(task.toSurah),
        ayah: Number(task.toAyah),
      };
    } else {
      carriedTypes.add(task.taskType);
    }
    await createCarriedRepeatTask(isMemorization, connection, plan, date, task);
  }
  return { lastCarriedMemorizationEnd, scheduledMemorizationFaces };
}

/** Keep repetition paired with a carried memorization task. */
async function createCarriedRepeatTask(isMemorization, connection, plan, date, task) {
  if (isMemorization) {
    await insertPlanTask(connection, {
      plan, date, type: 'repeat', fromPage: task.fromPage, toPage: task.toPage, targetPages: task.targetPages, bounds: {
        fromSurah: task.fromSurah,
        fromAyah: task.fromAyah,
        toSurah: task.toSurah,
        toAyah: task.toAyah,
      }
    });
  }
}

/** Preserve a failed teacher evaluation on the newly carried task using bound range identifiers. */
async function markCarriedTaskForRetry(task, connection, plan, date) {
  if (task.teacherCompleted === 0) {
    await connection.query(
      `
        UPDATE student_quran_tasks
        SET teacher_rating_key = 'repeat_required',
            teacher_rating_label = 'يحتاج إعادة'
        WHERE plan_id = ?
          AND task_date = ?
          AND task_type = ?
          AND from_page = ?
          AND to_page = ?
          AND COALESCE(from_surah, 0) = ?
          AND COALESCE(from_ayah, 0) = ?
          AND COALESCE(to_surah, 0) = ?
          AND COALESCE(to_ayah, 0) = ?
          AND teacher_completed IS NULL
        `,
      [plan.id, date, task.taskType, task.fromPage, task.toPage, task.fromSurah || 0, task.fromAyah || 0, task.toSurah || 0, task.toAyah || 0]
    );
  }
}

async function previewStudentPlanDay(connection, plan, date, settings) {
  // Preview only: use saved assignments or the same range builders without inserting tasks or advancing cursors.
  const normalizeAmounts = async (amounts) => (await nameStudentPreviewTasks(connection, amounts))
    .map((row) => normalizeTaskRow({ ...row, teacherCompleted: null }, 'ayah'));
  const [saved] = await connection.query(`SELECT id, task_type AS taskType, track,
    from_page AS fromPage, to_page AS toPage, from_surah AS fromSurah, from_ayah AS fromAyah,
    to_surah AS toSurah, to_ayah AS toAyah, target_pages AS targetPages,
    student_status AS studentStatus, teacher_completed AS teacherCompleted,
    executed_at AS executedAt, evaluated_at AS evaluatedAt, actual_to_page AS actualToPage,
    EXISTS (SELECT 1 FROM student_quran_recitation_attempts attempt
      WHERE attempt.task_id = student_quran_tasks.id AND attempt.is_official = 1) AS hasAttempt
    FROM student_quran_tasks WHERE student_id = ? AND plan_id = ? AND task_date = ?
      AND task_type IN ('memorization', 'link', 'review') ORDER BY id`, [plan.studentId, plan.id, date]);
  if (saved.length && (date <= getSaudiDateTimeParts().date || !canContinueQuranRevision(plan))) return normalizeAmounts(saved);
  if (!canContinueQuranRevision(plan) || (plan.startDate && date < plan.startDate)) return [];
  const amounts = [];
  const addRange = (type, start, end, faces) => {
    if (!start || !end) return;
    amounts.push({ id: `preview-${type}-${amounts.length}`, taskType: type, track: plan.track,
      fromPage: start.page, fromSurah: start.surah, fromAyah: start.ayah,
      toPage: end.page, toSurah: end.surah, toAyah: end.ayah, targetPages: faces, teacherCompleted: null });
  };
  const start = { page: plan.startPage, surah: plan.startSurah, ayah: plan.startAyah };
  const end = { page: plan.endPage, surah: plan.endSurah, ayah: plan.endAyah };
  const direction = getQuranRangeDirection(start, end);
  const next = await getNextUnmemorizedPlanPosition(connection, plan, { beforeDate: date });
  if (next && canCreateQuranTaskOnDate(settings, date, 'memorization')) {
    const range = await buildQuranRangeByFaceTarget(connection, next, end, Math.max(.25, Number(plan.dailyPages || 1)));
    const _resolveConditional5 = () => {
      if (range?.segments?.length) {
        return range.segments;
      }
      if (range) {
        return [range];
      }
      return [];
    };
    for (const part of _resolveConditional5()) addRange('memorization', part.start, part.end, part.faces);
  }
  const memorized = await getStudentMemorizedRanges(connection, plan.studentId, { beforeDate: date });
  const links = await buildExactLinkRanges(connection, memorized, next, direction, plan.linkPages || 10);
  const linkPages = new Set();
  for (const range of links) {
    for (let page = Math.min(range.startPage, range.endPage); page <= Math.max(range.startPage, range.endPage); page++) linkPages.add(page);
    if (canCreateQuranTaskOnDate(settings, date, 'link')) addRange('link',
      { page: range.startPage, surah: range.startSurah, ayah: range.startAyah },
      { page: range.endPage, surah: range.endSurah, ayah: range.endAyah }, range.faces);
  }
  const split = Boolean(Number(plan.reviewSplitWeekly || 0));
  const reviewDays = getPlanReviewDays(plan, settings);
  await appendPreviewReviewRanges({ settings, date, split, reviewDays, connection, memorized, linkPages, plan, addRange });
  const preservedTypes = new Set(saved.filter((row) => row.studentStatus === 'done'
    || row.teacherCompleted != null || row.executedAt || row.evaluatedAt || row.actualToPage || Number(row.hasAttempt))
    .map((row) => row.taskType));
  return normalizeAmounts([
    ...saved.filter((row) => preservedTypes.has(row.taskType)),
    ...amounts.filter((row) => !preservedTypes.has(row.taskType)),
  ]);
}

/** Preview eligible review pages without writing tasks or advancing cursors. */
async function appendPreviewReviewRanges({ settings, date, split, reviewDays, connection, memorized, linkPages, plan, addRange }) {
  if (canCreateQuranTaskOnDate(settings, date, 'review') && (!split || reviewDays.includes(getWeekDayFromDate(date)))) {
    const available = await getFullyMemorizedPages(connection, memorized, 1, 604);
    const pages = new Set([...available].filter((page) => !linkPages.has(page)));
    const count = split ? calculateWeeklyReviewDailyPages({ availableReviewPages: pages.size, reviewDays: reviewDays.length, minimumDailyPages: plan.reviewMinDailyPages }) : Number(plan.reviewPages || 20);
    const reviewStart = await getReviewStartForDate(connection, plan, date);
    const picked = split ? pickAvailablePages(pages, reviewStart, count) : pickReviewPagesByHizbs(pages, reviewStart, plan.reviewHizbs || 1);
    for (const range of pagesToRanges(picked.pages)) {
      const first = await getQuranPageBoundaryInDirection(connection, range.fromPage);
      const last = await getQuranPageBoundaryInDirection(connection, range.toPage);
      addRange('review', first?.start, last?.end, range.toPage - range.fromPage + 1);
    }
  }
}

async function rewindPlanAfterFailedMemorization(connection, task, {
  sessionDate = task.taskDate,
  sessionTaskIds = [],
  settings = null,
} = {}) {
  const failedPage = Number(task.fromPage || 0);
  const planId = Number(task.planId || 0);
  if (!planId || !failedPage) return;
  const [[plan]] = await connection.query(
    `SELECT start_page AS startPage, start_surah AS startSurah, start_ayah AS startAyah,
      end_page AS endPage, end_surah AS endSurah, end_ayah AS endAyah,
      next_memorization_page AS nextPage, next_memorization_surah AS nextSurah,
      next_memorization_ayah AS nextAyah
     FROM student_quran_plans WHERE id = ? LIMIT 1 FOR UPDATE`,
    [planId]
  );
  if (!plan) return;
  const direction = getQuranRangeDirection(
    { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
    { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) },
  );
  const failedPosition = {
    page: failedPage,
    surah: Number(task.fromSurah || 0),
    ayah: Number(task.fromAyah || 0),
  };
  const currentPosition = {
    page: Number(plan.nextPage || 0),
    surah: Number(plan.nextSurah || 0),
    ayah: Number(plan.nextAyah || 0),
  };
  const rewindPosition = !isValidQuranPosition(currentPosition)
    || compareQuranPositionInDirection(failedPosition, currentPosition, direction) < 0
    ? failedPosition
    : currentPosition;

  const excludedTaskIds = [...new Set([
    Number(task.id),
    ...(sessionTaskIds || []).map(Number),
  ].filter(Boolean))];
  const excludedSql = excludedTaskIds.length
    ? `AND displaced.id NOT IN (${excludedTaskIds.map(() => '?').join(', ')})`
    : '';
  const [displacedTasks] = await connection.query(
    `SELECT displaced.id, DATE_FORMAT(displaced.task_date, '%Y-%m-%d') AS taskDate
     FROM student_quran_tasks displaced
     WHERE displaced.plan_id = ?
       AND displaced.task_type IN ('memorization', 'repeat')
       AND displaced.task_date >= ?
       AND displaced.teacher_completed IS NULL
       AND COALESCE(displaced.student_status, 'not_done') <> 'done'
       ${excludedSql}
       AND NOT EXISTS (
         SELECT 1 FROM student_quran_recitation_attempts attempt
         WHERE attempt.task_id = displaced.id AND attempt.is_official = 1
       )
     FOR UPDATE`,
    [planId, sessionDate, ...excludedTaskIds],
  );
  const displacedIds = displacedTasks.map((row) => Number(row.id)).filter(Boolean);
  if (displacedIds.length) {
    await connection.query(
      `DELETE FROM student_quran_tasks WHERE id IN (${displacedIds.map(() => '?').join(', ')})`,
      displacedIds,
    );
  }

  await connection.query(
    `
    UPDATE student_quran_plans
    SET next_memorization_page = ?,
        next_memorization_surah = ?,
        next_memorization_ayah = ?,
        status = CASE WHEN status = 'completed' THEN 'active' ELSE status END
    WHERE id = ?
    `,
    [rewindPosition.page, rewindPosition.surah || null, rewindPosition.ayah || null, planId]
  );

  if (settings && isValidDateOnly(sessionDate)) {
    const refreshedPlan = await getActivePlanForStudent(connection, Number(task.studentId));
    if (refreshedPlan) await ensureStudentPlanTasks(connection, refreshedPlan, sessionDate, settings);
  }

}

function countUniquePagesWithinPlan(ranges, startPage, endPage) {
  const pages = new Set();
  const firstPlanPage = Math.min(Number(startPage), Number(endPage));
  const lastPlanPage = Math.max(Number(startPage), Number(endPage));
  for (const range of ranges || []) {
    const rangeStartPage = Number(range.startPage || range.fromPage || 0);
    const rangeEndPage = Number(range.endPage || range.toPage || 0);
    const fromPage = Math.max(firstPlanPage, Math.min(rangeStartPage, rangeEndPage));
    const toPage = Math.min(lastPlanPage, Math.max(rangeStartPage, rangeEndPage));
    for (let page = fromPage; page <= toPage; page += 1) {
      pages.add(page);
    }
  }
  return pages.size;
}

function normalizePlanRow(row) {
  if (!row) return null;
  const startPage = Number(row.startPage);
  const endPage = Number(row.endPage);
  const totalPages = Math.max(1, Math.abs(endPage - startPage) + 1);
  const totalAyahs = Number(row.totalAyahs || 0);
  const completedAyahs = Math.max(0, Math.min(totalAyahs || Number.MAX_SAFE_INTEGER, Number(row.completedAyahs || 0)));
  const hasDetailedProgress = Array.isArray(row.completedMemorization);
  const _resolveCompletedPages = () => {
    if (row.completedPagesExact !== undefined) {
      return Math.max(0, Math.min(totalPages, Number(row.completedPagesExact || 0)));
    }
    if (hasDetailedProgress) {
      return Math.min(totalPages, countUniquePagesWithinPlan(row.completedMemorization || [], startPage, endPage));
    }
    return Math.max(0, Math.min(totalPages, Number(row.completedPages || 0)));
  };
  const completedPages = _resolveCompletedPages();
  const progressPercent = totalAyahs > 0 ? Math.round((completedAyahs / totalAyahs) * 100) : Math.round((completedPages / totalPages) * 100);
  const dueFaces = Number(row.dueFaces || 0);
  const dueCompletedFaces = Number(row.dueCompletedFaces || 0);
  const adherencePercent = dueFaces ? Math.round(Math.min(100, (dueCompletedFaces / dueFaces) * 100)) : 0;
  const currentDate = getSaudiDateTimeParts().date;
  const { startDate: effectiveStartDate } = { startDate: row.startDate || row.createdDate };
  const _resolveScheduleStatus = () => {
    if (progressPercent >= 100) {
      return 'completed';
    }
    if (effectiveStartDate && currentDate < effectiveStartDate) {
      return 'not_started';
    }
    if (adherencePercent >= 100) {
      return 'on_track';
    }
    if (adherencePercent >= 80) {
      return 'at_risk';
    }
    return 'delayed';
  };
  const scheduleStatus = _resolveScheduleStatus();
  return {
    id: row.id,
    previousPlanId: row.previousPlanId || null,
    studentId: row.studentId,
    status: row.status,
    track: normalizeQuranPlanTrack(row.track),
    trackLabel: QURAN_PLAN_TRACK_LABELS[normalizeQuranPlanTrack(row.track)],
    startSurah: row.startSurah,
    startSurahName: row.startSurahName || '',
    startAyah: row.startAyah,
    startPage: row.startPage,
    endSurah: row.endSurah,
    endSurahName: row.endSurahName || '',
    endAyah: row.endAyah,
    endPage: row.endPage,
    dailyPages: Number(row.dailyPages || 1),
    linkPages: row.linkPages,
    reviewPages: row.reviewPages,
    reviewHizbs: Math.max(1, Number(row.reviewHizbs || 1)),
    readingFaces: row.readingFaces === null || row.readingFaces === undefined ? null : Number(row.readingFaces),
    reviewSplitWeekly: Boolean(Number(row.reviewSplitWeekly || 0)),
    reviewWeekStartDay: row.reviewWeekStartDay,
    reviewWeekEndDay: row.reviewWeekEndDay,
    reviewMinDailyPages: row.reviewMinDailyPages,
    createdDate: row.createdDate,
    startDate: row.startDate || '',
    hasOfficialStartDate: Boolean(row.startDate),
    effectiveFrom: row.effectiveFrom || row.startDate || row.createdDate,
    scheduleDays: Array.isArray(row.scheduleDays) ? row.scheduleDays : (() => {
      try { return JSON.parse(row.scheduleDays || '[]'); } catch { return []; }
    })(),
    scheduleAnchorPage: row.scheduleAnchorPage,
    scheduleAnchorSurah: row.scheduleAnchorSurah,
    scheduleAnchorAyah: row.scheduleAnchorAyah,
    targetEndDate: row.targetEndDate || null,
    priorMemorization: Array.isArray(row.priorMemorization) ? row.priorMemorization : [],
    completedMemorization: Array.isArray(row.completedMemorization) ? row.completedMemorization : [],
    nextMemorizationPage: row.nextMemorizationPage,
    nextMemorizationSurah: row.nextMemorizationSurah,
    nextMemorizationAyah: row.nextMemorizationAyah,
    nextReviewPage: row.nextReviewPage,
    progressPercent,
    adherencePercent,
    scheduleStatus,
    completedPages,
    totalPages,
    completedAyahs,
    totalAyahs,
    remainingPages: Math.max(0, totalPages - completedPages),
    summary: `${row.startSurahName || row.startSurah} ${row.startAyah} -> ${row.endSurahName || row.endSurah} ${row.endAyah}`,
  };
}

async function getActivePlanForStudent(connection, studentId) {
  const [[row]] = await connection.query(
    `
    SELECT
      p.id,
      p.previous_plan_id AS previousPlanId,
      p.student_id AS studentId,
      p.status,
      p.track,
      p.start_surah AS startSurah,
      p.start_ayah AS startAyah,
      p.start_page AS startPage,
      p.end_surah AS endSurah,
      p.end_ayah AS endAyah,
      p.end_page AS endPage,
      p.daily_pages AS dailyPages,
      p.link_pages AS linkPages,
      p.review_pages AS reviewPages,
      p.review_hizbs AS reviewHizbs,
      p.reading_faces AS readingFaces,
      p.review_split_weekly AS reviewSplitWeekly,
      p.review_week_start_day AS reviewWeekStartDay,
      p.review_week_end_day AS reviewWeekEndDay,
      p.review_min_daily_pages AS reviewMinDailyPages,
      DATE_FORMAT(p.created_at, '%Y-%m-%d') AS createdDate,
      DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
      DATE_FORMAT(p.target_end_date, '%Y-%m-%d') AS targetEndDate,
      DATE_FORMAT(p.effective_from, '%Y-%m-%d') AS effectiveFrom,
      p.schedule_days_json AS scheduleDays,
      p.schedule_anchor_page AS scheduleAnchorPage,
      p.schedule_anchor_surah AS scheduleAnchorSurah,
      p.schedule_anchor_ayah AS scheduleAnchorAyah,
        p.next_memorization_page AS nextMemorizationPage,
        p.next_memorization_surah AS nextMemorizationSurah,
        p.next_memorization_ayah AS nextMemorizationAyah,
        p.next_review_page AS nextReviewPage,
        COALESCE(cp.completedPages, 0) AS completedPages,
        COALESCE(pp.priorPages, 0) AS priorPages,
        COALESCE(schedule.dueFaces, 0) AS dueFaces,
        COALESCE(schedule.dueCompletedFaces, 0) AS dueCompletedFaces,
        qs.name_arabic AS startSurahName,
        qe.name_arabic AS endSurahName
      FROM student_quran_plans p
      LEFT JOIN quran_surahs qs ON qs.surah_number = p.start_surah
      LEFT JOIN quran_surahs qe ON qe.surah_number = p.end_surah
      LEFT JOIN (
        SELECT plan_id, COUNT(DISTINCT from_page) AS completedPages
        FROM student_quran_tasks
        WHERE ${acceptedMemorizationSql()}
          AND plan_id IN (SELECT id FROM student_quran_plans WHERE student_id = ? AND status IN ('active', 'completed'))
          AND from_page = to_page
          AND task_type = 'memorization'
        GROUP BY plan_id
      ) cp ON cp.plan_id = p.id
      LEFT JOIN (
        SELECT plan_id, SUM(end_page - start_page + 1) AS priorPages
        FROM student_quran_plan_prior_memorization
        WHERE plan_id IN (SELECT id FROM student_quran_plans WHERE student_id = ? AND status IN ('active', 'completed'))
        GROUP BY plan_id
      ) pp ON pp.plan_id = p.id
      LEFT JOIN (
        SELECT schedule_t.plan_id AS planId,
          SUM(COALESCE(schedule_t.target_pages, GREATEST(0, schedule_t.to_page - schedule_t.from_page + 1))) AS dueFaces,
          SUM(CASE WHEN schedule_t.teacher_completed = 1 OR (schedule_t.teacher_completed IS NULL AND schedule_t.student_status = 'done' AND COALESCE(schedule_t.execution_state, '') IN ('complete', 'partial', 'extra')) THEN GREATEST(0, COALESCE(schedule_t.actual_to_page, schedule_t.to_page) - schedule_t.from_page + 1) ELSE 0 END) AS dueCompletedFaces
        FROM student_quran_tasks schedule_t
        JOIN student_quran_plans schedule_p ON schedule_p.id = schedule_t.plan_id
        WHERE schedule_p.student_id = ? AND ${currentQuranPlanSql('schedule_p')}
          AND schedule_t.task_type = 'memorization'
          AND schedule_t.task_date <= CURDATE()
          AND schedule_t.task_date >= COALESCE(schedule_p.start_date, DATE(schedule_p.created_at))
        GROUP BY schedule_t.plan_id
      ) schedule ON schedule.planId = p.id
      WHERE p.student_id = ? AND ${currentQuranPlanSql('p')}
    LIMIT 1
    `,
    [studentId, studentId, studentId, studentId]
  );
  return normalizePlanRow(row);
}

function normalizeTaskRow(row, referenceMode = 'ayah') {
  const reviewExecution = parseReviewExecution(row.reviewExecution);
  const targetPages = row.targetPages === null || row.targetPages === undefined ? null : Number(row.targetPages);
  const taskPreview = {
    fromPage: row.fromPage,
    toPage: row.toPage,
    fromSurah: row.fromSurah,
    fromAyah: row.fromAyah,
    toSurah: row.toSurah,
    toAyah: row.toAyah,
    fromSurahName: row.fromSurahName,
    toSurahName: row.toSurahName,
    targetPages,
    normalEnd: row.normalToPage && row.normalToSurah && row.normalToAyah ? {
      page: Number(row.normalToPage), surah: Number(row.normalToSurah), ayah: Number(row.normalToAyah),
    } : null,
    scheduledEnd: row.scheduledToPage && row.scheduledToSurah && row.scheduledToAyah ? {
      page: Number(row.scheduledToPage), surah: Number(row.scheduledToSurah), ayah: Number(row.scheduledToAyah),
    } : null,
  };
  const actualToPage = row.actualToPage || row.toPage;
  const actualToSurah = row.actualToSurah || row.toSurah;
  const actualToAyah = row.actualToAyah || row.toAyah;
  const actualPreview = row.actualToPage && row.actualToSurah && row.actualToAyah
    ? buildTaskRangePreview({
      ...row,
      actualToPage,
      actualToSurah,
      actualToAyah,
    }, referenceMode, 'actualTo')
    : '';
  return {
    id: row.id,
    planId: row.planId,
    studentId: row.studentId,
    studentName: row.studentName,
    committeeName: row.committeeName,
    taskDate: row.taskDate,
    taskType: row.taskType,
    track: normalizeQuranPlanTrack(row.track),
    trackLabel: QURAN_PLAN_TRACK_LABELS[normalizeQuranPlanTrack(row.track)],
    compensationIndex: Number(row.compensationIndex || 0),
    compensationDays: Number(row.compensationDays || 0),
    fromPage: row.fromPage,
    toPage: row.toPage,
    fromSurah: row.fromSurah,
    fromAyah: row.fromAyah,
    toSurah: row.toSurah,
    toAyah: row.toAyah,
    actualToPage: row.actualToPage,
    actualToSurah: row.actualToSurah,
    actualToAyah: row.actualToAyah,
    actualToSurahName: row.actualToSurahName,
    actualToSurahAyahCount: row.actualToSurahAyahCount,
    fromSurahName: row.fromSurahName,
    toSurahName: row.toSurahName,
    toSurahAyahCount: row.toSurahAyahCount,
    targetPages,
    actualFaces: row.reviewExecution ? Number(reviewExecution?.faces || 0) : row.actualFaces === null || row.actualFaces === undefined ? targetPages : Number(row.actualFaces),
    normalEnd: taskPreview.normalEnd,
    scheduledEnd: taskPreview.scheduledEnd,
    executionState: row.executionState || null,
    expectedPreview: formatTaskPreview(taskPreview, referenceMode),
    reviewExecution,
    reviewGroupMember: Boolean(row.reviewExecution),
    actualPreview: reviewExecution ? reviewExecution.ranges.map(reviewRangeLabel).join('، ثم ') : actualPreview,
    preview: formatTaskPreview(taskPreview, referenceMode),
    ayahPreview: formatTaskPreview(taskPreview, 'ayah'),
    pagePreview: formatTaskPreview(taskPreview, 'page'),
    studentStatus: row.studentStatus,
    teacherRatingKey: row.teacherRatingKey,
    teacherRatingLabel: row.teacherRatingLabel,
    warningCount: Number(row.warningCount || 0),
    mistakeCount: Number(row.mistakeCount || 0),
    evaluationScore: row.evaluationScore === null || row.evaluationScore === undefined ? null : Number(row.evaluationScore),
    evaluationMaxScore: row.evaluationMaxScore === null || row.evaluationMaxScore === undefined ? null : Number(row.evaluationMaxScore),
    points: Number(row.points || 0),
    actualRepeatCount: row.actualRepeatCount === null || row.actualRepeatCount === undefined
      ? 0
      : Math.max(0, Number(row.actualRepeatCount)),
    actualListeningCount: row.actualListeningCount === null || row.actualListeningCount === undefined
      ? 0
      : Math.max(0, Number(row.actualListeningCount)),
    executionActorRole: row.executionActorRole || null,
    repeatExecutionActorRole: row.repeatExecutionActorRole || null,
    attemptCount: Math.max(0, Number(row.attemptCount || 0)),
    teacherCompleted: row.teacherCompleted === null ? null : Boolean(row.teacherCompleted),
  };
}

async function getQuranJuzRanges(connection) {
  const [rows] = await connection.query(
    `
    SELECT
      juz_number AS juz,
      MIN(page_number) AS startPage,
      MAX(page_number) AS endPage,
      SUBSTRING_INDEX(GROUP_CONCAT(surah_number ORDER BY page_number ASC, ayah_number ASC), ',', 1) AS startSurah,
      SUBSTRING_INDEX(GROUP_CONCAT(ayah_number ORDER BY page_number ASC, ayah_number ASC), ',', 1) AS startAyah,
      SUBSTRING_INDEX(GROUP_CONCAT(surah_number ORDER BY page_number DESC, ayah_number DESC), ',', 1) AS endSurah,
      SUBSTRING_INDEX(GROUP_CONCAT(ayah_number ORDER BY page_number DESC, ayah_number DESC), ',', 1) AS endAyah
    FROM quran_ayah_pages
    GROUP BY juz_number
    ORDER BY juz_number ASC
    `
  );
  return rows.map((row) => ({
    juz: Number(row.juz),
    startPage: Number(row.startPage),
    endPage: Number(row.endPage),
    startSurah: Number(row.startSurah),
    startAyah: Number(row.startAyah),
    endSurah: Number(row.endSurah),
    endAyah: Number(row.endAyah),
  }));
}

async function getStudentAvailableJuzs(connection, studentId) {
  const [juzRanges, memorizedRanges] = await Promise.all([
    getQuranJuzRanges(connection),
    getStudentMemorizedRanges(connection, studentId),
  ]);

  const ayahs = await getQuranAyahsInPageRange(connection, 1, 604);
  const pageCoverage = new Map();
  ayahs.forEach((ayah) => {
    const page = Number(ayah.page);
    if (!pageCoverage.has(page)) pageCoverage.set(page, { total: 0, memorized: 0 });
    const coverage = pageCoverage.get(page);
    coverage.total += 1;
    if (quranPositionInRanges(ayah, memorizedRanges)) coverage.memorized += 1;
  });
  const items = [];
  for (const range of juzRanges) {
    const juzAyahs = ayahs.filter((ayah) => Number(ayah.juz) === Number(range.juz));
    const memorizedAyahs = juzAyahs.filter((ayah) => quranPositionInRanges(ayah, memorizedRanges)).length;
    const memorizedPages = [...pageCoverage.entries()]
      .filter(([page, coverage]) => page >= range.startPage
        && page <= range.endPage
        && coverage.total > 0
        && coverage.total === coverage.memorized)
      .length;
    const totalPages = range.endPage - range.startPage + 1;
    const totalAyahs = juzAyahs.length;
    items.push({
      ...range,
      label: `الجزء ${range.juz}`,
      totalPages,
      memorizedPages,
      totalAyahs,
      memorizedAyahs,
      progressPercent: totalAyahs > 0 ? Math.round((memorizedAyahs / totalAyahs) * 100) : 0,
      savedRanges: memorizedSegments(juzAyahs, (ayah) => quranPositionInRanges(ayah, memorizedRanges)),
      isComplete: totalAyahs > 0 && memorizedAyahs >= totalAyahs,
    });
  }
  return items;
}

function getJuzLabel(juzNumber) {
  return `الجزء ${Number(juzNumber || 0).toLocaleString('ar-SA')}`;
}

function toAsciiDigits(value = '') {
  return String(value).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicIndex = arabicDigits.indexOf(digit);
    if (arabicIndex >= 0) return String(arabicIndex);
    return String(persianDigits.indexOf(digit));
  });
}

function toDigitsOnly(value = '') {
  return toAsciiDigits(value).replace(/\D/g, '');
}

function invalidInput(message) {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
}

function normalizeAccountName(value, label) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 180) {
    throw invalidInput(`${label} يجب أن يكون بين حرفين و180 حرفًا.`);
  }
  return name;
}

function normalizeAccountLoginNumber(value) {
  const loginNumber = toAsciiDigits(value).trim();
  if (!/^\d{3,80}$/.test(loginNumber)) {
    throw invalidInput('رقم الدخول يجب أن يتكون من 3 إلى 80 رقمًا.');
  }
  return loginNumber;
}

function normalizeAccountPhone(value) {
  try {
    return normalizeOptionalPhone(value);
  } catch (error) {
    throw invalidInput(error.message);
  }
}

function normalizeOptionalNationalId(value) {
  try {
    return normalizeOptionalIdentity(value);
  } catch (error) {
    throw invalidInput(error.message);
  }
}

async function ensureCommitteeIdsExist(connection, values, { required = true } = {}) {
  const ids = [...new Set(
    (Array.isArray(values) ? values : [values])
      .map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0)
  )];
  if (!ids.length) {
    if (required) throw invalidInput('اختيار الحلقة مطلوب.');
    return [];
  }
  const [rows] = await connection.query(
    `SELECT id FROM committees WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  if (rows.length !== ids.length) throw invalidInput('إحدى الحلقات المختارة غير موجودة.');
  return ids;
}

function parseJsonValue(value, fallback) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

/** Reuse immutable chapter metadata within the current database connection or pool. */
async function getQuranChaptersForClient(connection) {
  return readQuranChapters(connection);
}

async function getQuranJuzRangesForClient(connection) {
  const [rows] = await connection.query(
    `
    SELECT
      juz_number AS juz,
      surah_number AS surah,
      surah_name AS surahName,
      ayah_number AS ayah,
      page_number AS page
    FROM quran_ayah_pages
    ORDER BY juz_number ASC, page_number ASC, surah_number ASC, ayah_number ASC
    `
  );
  const byJuz = new Map();
  for (const row of rows) {
    const key = String(row.juz);
    const item = byJuz.get(key) || {
      juz: Number(row.juz),
      startPage: Number(row.page),
      endPage: Number(row.page),
      startSurah: Number(row.surah),
      startAyah: Number(row.ayah),
      startSurahName: row.surahName,
      endSurah: Number(row.surah),
      endAyah: Number(row.ayah),
      endSurahName: row.surahName,
    };
    item.endPage = Number(row.page);
    item.endSurah = Number(row.surah);
    item.endAyah = Number(row.ayah);
    item.endSurahName = row.surahName;
    byJuz.set(key, item);
  }
  return [...byJuz.values()];
}

function normalizeRegistrationPerson(body = {}) {
  const name = String(body.name || '').replace(/\s+/g, ' ').trim();
  const guardianPhone = normalizeAccountPhone(body.guardianPhone);
  const nationalId = normalizeOptionalNationalId(body.nationalId);
  const age = Number(toDigitsOnly(body.age));

  if (name.length < 2 || name.length > 180) {
    const error = new Error('اكتب اسم الطالب.');
    error.statusCode = 422;
    throw error;
  }
  if (!Number.isInteger(age) || age < 4 || age > 120) {
    const error = new Error('العمر غير صحيح.');
    error.statusCode = 422;
    throw error;
  }

  return { name, guardianPhone, nationalId, age };
}

function quranRangeKey(range) {
  return [
    range.startSurah,
    range.startAyah,
    range.startPage,
    range.endSurah,
    range.endAyah,
    range.endPage,
  ].join(':');
}

function positionFromRangeStart(range) {
  return { surah: Number(range.startSurah), ayah: Number(range.startAyah), page: Number(range.startPage) };
}

function positionFromRangeEnd(range) {
  return { surah: Number(range.endSurah), ayah: Number(range.endAyah), page: Number(range.endPage) };
}

function isSameQuranRange(a, b) {
  return quranRangeKey(a) === quranRangeKey(b);
}

function findFullJuzForRange(juzRanges, range) {
  return juzRanges.find((juz) => isSameQuranRange(juz, range)) || null;
}

async function normalizeRegistrationMemorization(connection, memorizationInput = {}) {
  const input = memorizationInput && typeof memorizationInput === 'object' ? memorizationInput : {};
  const juzRanges = await getQuranJuzRangesForClient(connection);
  const juzByNumber = new Map(juzRanges.map((juz) => [Number(juz.juz), juz]));
  const itemsByRange = new Map();
  const addItem = (item) => {
    const key = quranRangeKey(item);
    const current = itemsByRange.get(key);
    if (!current || item.type === 'juz') {
      itemsByRange.set(key, item);
    }
  };

  const fullJuzs = [...new Set((Array.isArray(input.fullJuzs) ? input.fullJuzs : [])
    .map(Number)
    .filter((juz) => Number.isInteger(juz) && juz >= 1 && juz <= 30))];

  for (const juzNumber of fullJuzs) {
    const juz = juzByNumber.get(juzNumber);
    if (!juz) continue;
    addItem({
      id: `juz-${juzNumber}`,
      type: 'juz',
      juz: juzNumber,
      label: getJuzLabel(juzNumber),
      ...normalizeQuranRange(juz),
    });
  }

  const partialRanges = Array.isArray(input.partialRanges) ? input.partialRanges : [];
  const rangeIndex = 1;
  await addPartialMemorizationRanges({ partialRanges, connection, juzByNumber, juzRanges, addItem, rangeIndex });

  const items = [...itemsByRange.values()]
    .sort((a, b) => compareQuranPosition(positionFromRangeStart(a), positionFromRangeStart(b)))
    .map((item, index) => ({ ...item, order: index + 1 }));

  for (let index = 1; index < items.length; index += 1) {
    if (compareQuranPosition(positionFromRangeStart(items[index]), positionFromRangeEnd(items[index - 1])) <= 0) {
      const error = new Error('مقاطع المحفوظ لا يمكن أن تتداخل.');
      error.statusCode = 422;
      throw error;
    }
  }

  return { items };
}

/** Validate partial memorization endpoints and merge equivalent full-juz ranges. */
async function addPartialMemorizationRanges({ partialRanges, connection, juzByNumber, juzRanges, addItem, rangeIndex }) {
  for (const partial of partialRanges) {
    const start = await getQuranAyah(connection, Number(partial.startSurah || 0), Number(partial.startAyah || 0));
    const end = await getQuranAyah(connection, Number(partial.endSurah || 0), Number(partial.endAyah || 0));
    if (!start || !end) {
      const error = new Error('نطاق المحفوظ الجزئي غير صحيح.');
      error.statusCode = 422;
      throw error;
    }
    if (compareQuranPosition(start, end) > 0) {
      const error = new Error('بداية المحفوظ الجزئي يجب أن تكون قبل نهايته.');
      error.statusCode = 422;
      throw error;
    }

    const selectedJuz = Number(partial.juz || 0);
    const selectedJuzRange = selectedJuz ? juzByNumber.get(selectedJuz) : null;
    if (selectedJuzRange) {
      if (compareQuranPosition(start, positionFromRangeStart(selectedJuzRange)) < 0
        || compareQuranPosition(end, positionFromRangeEnd(selectedJuzRange)) > 0) {
        const error = new Error('النطاق الجزئي يجب أن يكون داخل الجزء المختار.');
        error.statusCode = 422;
        throw error;
      }
    }

    const range = {
      startSurah: Number(start.surah),
      startAyah: Number(start.ayah),
      startPage: Number(start.page),
      endSurah: Number(end.surah),
      endAyah: Number(end.ayah),
      endPage: Number(end.page),
    };
    const fullJuz = findFullJuzForRange(juzRanges, range);
    if (fullJuz) {
      addItem({
        id: `juz-${fullJuz.juz}`,
        type: 'juz',
        juz: Number(fullJuz.juz),
        label: getJuzLabel(fullJuz.juz),
        ...normalizeQuranRange(fullJuz),
      });
      continue;
    }

    const label = formatTaskPreview({
      fromSurah: start.surah,
      fromAyah: start.ayah,
      toSurah: end.surah,
      toAyah: end.ayah,
      fromSurahName: start.surahName,
      toSurahName: end.surahName,
    });
    addItem({
      id: `range-${rangeIndex}`,
      type: 'range',
      juz: selectedJuz || Number(start.juz),
      label,
      ...range,
    });
    rangeIndex += 1;
  }
  return rangeIndex;
}

function getRegistrationMemorizedJuzs(items = [], juzRanges = []) {
  if (!juzRanges.length) {
    return [...new Set(items.map((item) => Number(item.juz)).filter((juz) => juz >= 1 && juz <= 30))].sort((a, b) => a - b);
  }
  return juzRanges.filter((juz) => items.some((item) => (
    compareQuranPosition(positionFromRangeStart(item), positionFromRangeEnd(juz)) <= 0
    && compareQuranPosition(positionFromRangeEnd(item), positionFromRangeStart(juz)) >= 0
  ))).map((juz) => Number(juz.juz));
}

function serializeRegistrationRequest(row, { juzRanges = [] } = {}) {
  const memorization = parseJsonValue(row.memorizationJson, { items: [] });
  const memorizationItems = Array.isArray(memorization?.items) ? memorization.items : [];
  const testResults = parseJsonValue(row.testResultsJson, {});
  return {
    id: Number(row.id),
    name: row.name,
    guardianPhone: row.guardianPhone,
    nationalId: row.nationalId,
    age: Number(row.age || 0),
    memorization: {
      items: memorizationItems,
      juzs: getRegistrationMemorizedJuzs(memorizationItems, juzRanges),
    },
    testResults: testResults && typeof testResults === 'object' ? testResults : {},
    preliminarySentAt: row.preliminarySentAt || null,
    createdAt: row.createdAt,
  };
}

async function getRegistrationRequestById(connection, id, { lock = false } = {}) {
  const [rows] = await connection.query(
    `
    SELECT
      id,
      name,
      guardian_phone AS guardianPhone,
      national_id AS nationalId,
      age,
      memorization_json AS memorizationJson,
      test_results_json AS testResultsJson,
      DATE_FORMAT(preliminary_sent_at, '%Y-%m-%d %H:%i:%s') AS preliminarySentAt,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
    FROM registration_requests
    WHERE id = ?
    ${lock ? 'FOR UPDATE' : ''}
    `,
    [id]
  );
  return rows[0] ? serializeRegistrationRequest(rows[0]) : null;
}

function normalizeRegistrationTestResults(items, value = {}) {
  const results = value && typeof value === 'object' ? value : {};
  const normalized = {};
  for (const item of items) {
    const status = String(results[item.id] || '').trim();
    if (!['passed', 'failed'].includes(status)) {
      const error = new Error('أكمل نتيجة اختبار كل محفوظ قبل القبول.');
      error.statusCode = 422;
      throw error;
    }
    normalized[item.id] = status;
  }
  return normalized;
}

async function saveStandalonePriorMemorizationRanges(connection, studentId, ranges) {
  if (!ranges.length) return;
  await connection.query(
    `
    INSERT INTO student_quran_prior_memorization
      (student_id, source, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page)
    VALUES ?
    `,
    [ranges.map((range) => [
      studentId,
      'registration',
      range.startSurah,
      range.startAyah,
      range.startPage,
      range.endSurah,
      range.endAyah,
      range.endPage,
    ])]
  );
}

function normalizeRepeatCount(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(100, Math.max(1, Math.floor(number)));
}

function getRecitationEvaluationType(task = {}) {
  if (task.taskType === 'memorization' && normalizeQuranPlanTrack(task.track) === 'mastery') return 'mastery';
  return ['memorization', 'review', 'link'].includes(task.taskType) ? task.taskType : 'memorization';
}

function getRecitationEvaluationMode(settings, task = {}, accountRole = 'supervisor', preferences = null) {
  const type = getRecitationEvaluationType(task);
  const preferredMode = preferences?.[`${type}Mode`];
  if (preferredMode === 'count' || preferredMode === 'mushaf') return preferredMode;
  const settingSuffix = {
    memorization: 'Memorization',
    mastery: 'Memorization',
    review: 'Review',
    link: 'Link',
  }[type] || 'Memorization';
  const accountPrefix = accountRole === 'reciter' ? 'reciter' : 'teacher';
  return settings[`${accountPrefix}${settingSuffix}RecitationMode`] === 'count' ? 'count' : 'mushaf';
}

async function markExpiredPendingQuranTasks(connection, today = getSaudiDateTimeParts().date) {
  await expireQuranTasks(connection, today);
}

async function markPendingQuranTasksForDate(connection, date) {
  await connection.query(
    `
    UPDATE student_quran_tasks
    SET student_status = 'not_done'
    WHERE student_status = 'pending'
      AND teacher_completed IS NULL
      AND task_date = ?
    `,
    [date]
  );
}

async function processAutomaticExecutionMessages() {
  const databaseName = getDatabaseContext().databaseName;
  if (automaticExecutionRunning.has(databaseName)) return;
  automaticExecutionRunning.add(databaseName);

  try {
    const settings = await loadSettings();
    if (!hasStudentQuranExecution(settings) || !settings.automaticExecutionMessageEnabled || !settings.executionReminderTemplate) return;

    const now = getSaudiDateTimeParts();
    if (settings.automaticExecutionLastRunDate === now.date) return;
    if (!isCurrentTimeAtOrAfter(now.time, settings.automaticExecutionMessageTime)) return;

    const connection = await db().getConnection();
    let students = [];
    await prepareAutomaticExecutionTasks(connection, now, settings);

    const [rows] = await db().query(
      `
      SELECT
        s.id AS studentId,
        s.name,
        t.id,
        t.plan_id AS planId,
        t.task_date AS taskDate,
        t.task_type AS taskType,
        t.track AS track,
        t.from_page AS fromPage,
        t.to_page AS toPage,
        t.from_surah AS fromSurah,
        t.from_ayah AS fromAyah,
        t.to_surah AS toSurah,
        t.to_ayah AS toAyah,
        qsf.name_arabic AS fromSurahName,
        qst.name_arabic AS toSurahName,
        t.target_pages AS targetPages,
        t.review_execution_json AS reviewExecution,
        t.actual_to_page AS actualToPage,
        t.actual_to_surah AS actualToSurah,
        t.actual_to_ayah AS actualToAyah,
        t.execution_state AS executionState,
        t.actual_repeat_count AS actualRepeatCount,
        t.actual_listening_count AS actualListeningCount,
        t.student_status AS studentStatus,
        t.teacher_rating_key AS teacherRatingKey,
        t.teacher_rating_label AS teacherRatingLabel,
        t.warning_count AS warningCount,
        t.mistake_count AS mistakeCount,
        t.evaluation_score AS evaluationScore,
        t.evaluation_max_score AS evaluationMaxScore,
        t.points,
        t.teacher_completed AS teacherCompleted
      FROM students s
      JOIN student_quran_tasks t ON t.student_id = s.id
      LEFT JOIN quran_surahs qsf ON qsf.surah_number = t.from_surah
      LEFT JOIN quran_surahs qst ON qst.surah_number = t.to_surah
      WHERE t.task_date = ?
        AND t.task_type IN ('memorization', 'review', 'link')
        AND COALESCE(t.target_pages, 0) > 0
        AND t.from_page BETWEEN 1 AND 604
        AND t.to_page BETWEEN 1 AND 604
        AND COALESCE(t.from_surah, 0) > 0
        AND COALESCE(t.from_ayah, 0) > 0
        AND COALESCE(t.to_surah, 0) > 0
        AND COALESCE(t.to_ayah, 0) > 0
        AND t.student_status = 'not_done'
        AND NOT EXISTS (
          SELECT 1
          FROM whatsapp_messages wm
          WHERE wm.student_id = s.id
            AND wm.message_type = 'execution_reminder'
            AND wm.status = 'sent'
            AND wm.created_at >= CONVERT_TZ(CONCAT(?, ' ${BUSINESS_DAY_START_TIME}'), '+03:00', '+00:00')
            AND wm.created_at < CONVERT_TZ(DATE_ADD(CONCAT(?, ' ${BUSINESS_DAY_START_TIME}'), INTERVAL 1 DAY), '+03:00', '+00:00')
        )
      ORDER BY s.name ASC, FIELD(t.task_type, 'memorization', 'repeat', 'review', 'link'), t.from_page ASC
      `,
      [now.date, now.date, now.date]
    );
    const taskTypeLabels = {
      memorization: 'الحفظ',
      repeat: 'التكرار',
      review: 'المراجعة',
      link: 'الربط',
    };
    const excludedStudentIds = new Set(normalizePositiveIdList(settings.executionReminderExcludedStudentIds));
    const studentsById = new Map();
    groupExecutionReminderTasks(rows, excludedStudentIds, settings, studentsById, taskTypeLabels);
    students = [...studentsById.values()].map((student) => ({
      id: student.id,
      name: student.name,
      tasks: student.taskTexts.join('، '),
    }));

    let notificationFailures = 0;
    notificationFailures = await sendExecutionReminderBatch(students, settings, now, notificationFailures);

    if (notificationFailures === 0) {
      await db().query(
        `
        INSERT INTO app_settings (setting_key, setting_value)
        VALUES ('automaticExecutionLastRunDate', ?)
        ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
        `,
        [now.date]
      );
    }
  } catch (error) {
    console.error('Automatic execution messages failed:', error);
  } finally {
    automaticExecutionRunning.delete(databaseName);
  }
}

/** Send guardian reminders sequentially with the existing delay and report failures before marking the day complete. */
async function sendExecutionReminderBatch(students, settings, now, notificationFailures) {
  for (const [index, student] of students.entries()) {
    try {
      const status = await notifyStudentGuardian(student.id, settings.executionReminderTemplate, {
        date: now.date,
        tasks: student.tasks || '',
        messageType: 'execution_reminder',
      });
      if (status !== 'sent') notificationFailures += 1;
    } catch (error) {
      notificationFailures += 1;
      console.error('Automatic execution notification failed:', error);
    }
    if (index < students.length - 1) {
      await wait(randomWhatsAppDelay());
    }
  }
  return notificationFailures;
}

/** Group reminder text by student while honoring the configured exclusion list. */
function groupExecutionReminderTasks(rows, excludedStudentIds, settings, studentsById, taskTypeLabels) {
  for (const row of rows) {
    if (excludedStudentIds.has(Number(row.studentId))) continue;
    const key = String(row.studentId);
    const task = normalizeTaskRow(row, settings.quranReferenceMode);
    if (!studentsById.has(key)) {
      studentsById.set(key, { id: row.studentId, name: row.name, taskTexts: [] });
    }
    const taskLabel = task.taskType === 'memorization'
      ? task.trackLabel
      : taskTypeLabels[task.taskType] || task.taskType;
    studentsById.get(key).taskTexts.push(`${taskLabel}: ${task.preview || '-'}`);
  }
}

/** Generate and expire daily tasks in one transaction, rolling back before releasing the connection. */
async function prepareAutomaticExecutionTasks(connection, now, settings) {
  try {
    await connection.beginTransaction();
    const [plans] = await connection.query(
      `
        SELECT
          p.id,
          p.student_id AS studentId,
          p.status,
          p.track,
          p.start_surah AS startSurah,
          p.start_ayah AS startAyah,
          p.start_page AS startPage,
          p.end_surah AS endSurah,
          p.end_ayah AS endAyah,
          p.end_page AS endPage,
          p.daily_pages AS dailyPages,
          p.link_pages AS linkPages,
          p.review_pages AS reviewPages,
      p.review_hizbs AS reviewHizbs,
      p.reading_faces AS readingFaces,
          p.review_split_weekly AS reviewSplitWeekly,
          p.review_week_start_day AS reviewWeekStartDay,
          p.review_week_end_day AS reviewWeekEndDay,
          p.review_min_daily_pages AS reviewMinDailyPages,
          DATE_FORMAT(p.created_at, '%Y-%m-%d') AS createdDate,
          DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
          DATE_FORMAT(p.target_end_date, '%Y-%m-%d') AS targetEndDate,
          p.next_memorization_page AS nextMemorizationPage,
          p.next_memorization_surah AS nextMemorizationSurah,
          p.next_memorization_ayah AS nextMemorizationAyah,
          p.next_review_page AS nextReviewPage
        FROM student_quran_plans p
        WHERE ${currentQuranPlanSql('p')}
        `
    );
    for (const plan of plans.map(normalizePlanRow)) {
      await ensureStudentPlanTasks(connection, plan, now.date, settings);
      await ensureRepeatTasksForMemorizationDate(connection, plan, now.date);
    }
    await markPendingQuranTasksForDate(connection, now.date);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Include the primary database once, followed by each distinct active tenant database. */
function buildActiveTenantScope(rows, defaultDatabase) {
  const defaultTenant = { registrationNumber: '', name: siteConfig.name, databaseName: defaultDatabase };
  const seenDatabases = new Set();
  return [defaultTenant, ...(Array.isArray(rows) ? rows : [])].filter((tenant) => {
    const databaseName = String(tenant?.databaseName || '').trim();
    if (!databaseName || seenDatabases.has(databaseName)) return false;
    seenDatabases.add(databaseName);
    return true;
  });
}

async function forEachActiveTenant(callback) {
  let complexes = [];
  try {
    [complexes] = await platformDb().query(
      `
      SELECT
        registration_number AS registrationNumber,
        name,
        database_name AS databaseName
      FROM platform_complexes
      WHERE status = 'active' AND database_name IS NOT NULL
      ORDER BY id
      `,
    );
  } catch (error) {
    console.warn('Platform tenant lookup failed; continuing with the primary database:', error.message);
  }
  const defaultDatabase = process.env.MYSQL_DATABASE || `wajeh_${siteConfig.key}`;
  for (const complex of buildActiveTenantScope(complexes, defaultDatabase)) {
    try {
      await initDatabase(complex.databaseName);
      await runWithDatabase(complex.databaseName, { tenant: complex }, () => callback(complex));
    } catch (error) {
      console.error(`Tenant task failed for ${complex.registrationNumber}:`, error);
    }
  }
}

async function processAllTenantAutomations() {
  await forEachActiveTenant(async () => {
    const connection = await db().getConnection();
    const databaseName = getDatabaseContext().databaseName;
    const lockName = `nukhab:automation:${crypto
      .createHash('sha256')
      .update(databaseName)
      .digest('hex')
      .slice(0, 32)}`;
    let lockAcquired = false;
    try {
      const [[lockResult]] = await connection.query(
        'SELECT GET_LOCK(?, 0) AS acquired',
        [lockName],
      );
      lockAcquired = Number(lockResult?.acquired) === 1;
      if (!lockAcquired) return;
      await processAutomaticExecutionMessages();
      await runScheduledDatabaseBackup(getSaudiDateTimeParts());
    } finally {
      if (lockAcquired) {
        await connection.query('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
      }
      connection.release();
    }
  });
}

let automationSchedulerTimer;
let automationSchedulerRunning = false;

async function runTenantAutomationCycle() {
  if (automationSchedulerRunning) return;
  automationSchedulerRunning = true;
  try {
    await processAllTenantAutomations();
  } finally {
    automationSchedulerRunning = false;
    automationSchedulerTimer = setTimeout(runTenantAutomationCycle, 60 * 1000);
    automationSchedulerTimer.unref?.();
  }
}

function startAutomaticAbsenceScheduler() {
  void runTenantAutomationCycle();
}

function normalizeWeeklyHolidayDays(value) {
  const raw = Array.isArray(value)
    ? value
    : (() => {
      try {
        return JSON.parse(value || '[]');
      } catch {
        return DEFAULT_WEEKLY_HOLIDAY_DAYS;
      }
    })();
  const days = [...new Set((Array.isArray(raw) ? raw : DEFAULT_WEEKLY_HOLIDAY_DAYS).map(Number))]
    .filter((day) => WEEK_DAYS.includes(day));
  return days;
}

function normalizeWeekDayList(value, fallback) {
  const raw = Array.isArray(value)
    ? value
    : (() => {
      try {
        return JSON.parse(value || '[]');
      } catch {
        return fallback;
      }
    })();
  const days = [...new Set((Array.isArray(raw) ? raw : fallback).map(Number))]
    .filter((day) => WEEK_DAYS.includes(day));
  return days.length ? days : fallback;
}

function normalizeHolidayTaskTypes(value) {
  const raw = Array.isArray(value)
    ? value
    : (() => {
      try {
        return JSON.parse(value || '[]');
      } catch {
        return [];
      }
    })();
  return [...new Set((Array.isArray(raw) ? raw : []).map(String))]
    .filter((type) => QURAN_DAILY_TASK_TYPES.has(type));
}

function normalizePositiveIdList(value) {
  const raw = Array.isArray(value)
    ? value
    : (() => {
      try {
        return JSON.parse(value || '[]');
      } catch {
        return [];
      }
    })();
  return [...new Set((Array.isArray(raw) ? raw : []).map(Number))]
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

function normalizeSettings(rows) {
  const settings = Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
  // Students never execute their tasks; the teacher executes every task type.
  const memorizationExecutionSource = getQuranTaskExecutionSource(settings, 'memorization');
  const reviewExecutionSource = getQuranTaskExecutionSource(settings, 'review');
  const linkExecutionSource = getQuranTaskExecutionSource(settings, 'link');
  const repeatExecutionSource = memorizationExecutionSource;
  const memorizationAndMasteryRecitationMode = settings.memorizationRecitationMode === 'count' ? 'count' : 'mushaf';
  const reviewRecitationMode = settings.reviewRecitationMode === 'count' ? 'count' : 'mushaf';
  const linkRecitationMode = settings.linkRecitationMode === 'count' ? 'count' : 'mushaf';
  const attendanceDays = (() => {
    try {
      const parsed = JSON.parse(settings.attendanceDays || '[]');
      return Array.isArray(parsed)
        ? parsed.map(Number).filter((day) => WEEK_DAYS.includes(day))
        : [];
    } catch {
      return [];
    }
  })();
  const _resolveTeacherMemorizationRecitationMode = () => {
    if (settings.teacherMemorizationRecitationMode === 'count') {
      return 'count';
    }
    if (settings.teacherMemorizationRecitationMode === 'mushaf') {
      return 'mushaf';
    }
    return memorizationAndMasteryRecitationMode;
  };
  const _resolveTeacherReviewRecitationMode = () => {
    if (settings.teacherReviewRecitationMode === 'count') {
      return 'count';
    }
    if (settings.teacherReviewRecitationMode === 'mushaf') {
      return 'mushaf';
    }
    return reviewRecitationMode;
  };
  const _resolveTeacherLinkRecitationMode = () => {
    if (settings.teacherLinkRecitationMode === 'count') {
      return 'count';
    }
    if (settings.teacherLinkRecitationMode === 'mushaf') {
      return 'mushaf';
    }
    return linkRecitationMode;
  };
  const _resolveReciterMemorizationRecitationMode = () => {
    if (settings.reciterMemorizationRecitationMode === 'count') {
      return 'count';
    }
    if (settings.reciterMemorizationRecitationMode === 'mushaf') {
      return 'mushaf';
    }
    return memorizationAndMasteryRecitationMode;
  };
  const _resolveReciterReviewRecitationMode = () => {
    if (settings.reciterReviewRecitationMode === 'count') {
      return 'count';
    }
    if (settings.reciterReviewRecitationMode === 'mushaf') {
      return 'mushaf';
    }
    return reviewRecitationMode;
  };
  const _resolveReciterLinkRecitationMode = () => {
    if (settings.reciterLinkRecitationMode === 'count') {
      return 'count';
    }
    if (settings.reciterLinkRecitationMode === 'mushaf') {
      return 'mushaf';
    }
    return linkRecitationMode;
  };
  return {
    maxDailyStudentPoints: Number(settings.maxDailyStudentPoints || 0),
    studentPointsAddToFamily: settings.studentPointsAddToFamily !== 'false',
    memorizationRepeatCount: normalizeRepeatCount(settings.memorizationRepeatCount, 1),
    masteryRepeatCount: normalizeRepeatCount(settings.masteryRepeatCount, 1),
    memorizationListeningCount: normalizeRepeatCount(settings.memorizationListeningCount || settings.listeningCount, 3),
    masteryListeningCount: normalizeRepeatCount(settings.masteryListeningCount || settings.listeningCount, 3),
    maxSupervisorStudentPoints: Number(settings.maxSupervisorStudentPoints ?? 10),
    maxSupervisorFamilyItemsPoints: Number(
      settings.maxSupervisorFamilyItemsPoints ?? settings.maxStudentPoints ?? 100
    ),
    maxSupervisorDeductionPoints: Number(settings.maxSupervisorDeductionPoints ?? 10),
    familyPointsAddToStudents: settings.familyPointsAddToStudents !== 'false',
    familyPointsAddToAbsentStudents: settings.familyPointsAddToAbsentStudents !== 'false',
    familyEvaluationScope: FAMILY_EVALUATION_SCOPES.has(settings.familyEvaluationScope)
      ? settings.familyEvaluationScope
      : 'program_supervisor',
    activityLogEnabled: false,
    ...normalizeRankingAndStoreSettings(settings),
    ...normalizeAttendanceSettings(settings, attendanceDays),
    attendanceAbsentTemplate: settings.attendanceAbsentTemplate || 'السلام عليكم، تم تسجيل غياب الطالب {name} بتاريخ {date}.',
    automaticAbsenceMessageEnabled: settings.automaticAbsenceMessageEnabled === 'true',
    automaticExecutionMessageEnabled: settings.automaticExecutionMessageEnabled === 'true',
    automaticExecutionMessageTime: settings.automaticExecutionMessageTime || '23:59',
    automaticExecutionLastRunDate: settings.automaticExecutionLastRunDate || '',
    executionReminderTemplate: settings.executionReminderTemplate || 'السلام عليكم، لم يتم تنفيذ خطة الطالب {name} بتاريخ {date}.',
    executionReminderExcludedStudentIds: normalizePositiveIdList(settings.executionReminderExcludedStudentIds),
    quranReferenceMode: settings.quranReferenceMode === 'page' ? 'page' : 'ayah',
    memorizationRecitationMode: memorizationAndMasteryRecitationMode,
    masteryRecitationMode: memorizationAndMasteryRecitationMode,
    reviewRecitationMode,
    linkRecitationMode,
    teacherMemorizationRecitationMode: _resolveTeacherMemorizationRecitationMode(),
    teacherReviewRecitationMode: _resolveTeacherReviewRecitationMode(),
    teacherLinkRecitationMode: _resolveTeacherLinkRecitationMode(),
    reciterMemorizationRecitationMode: _resolveReciterMemorizationRecitationMode(),
    reciterReviewRecitationMode: _resolveReciterReviewRecitationMode(),
    reciterLinkRecitationMode: _resolveReciterLinkRecitationMode(),
    eventNotifications: normalizeEventNotifications(JSON.parse(settings.eventNotifications || '{}')),
    registrationEnabled: settings.registrationEnabled === 'true',
    registrationPreAcceptTemplate: settings.registrationPreAcceptTemplate || 'السلام عليكم، تم قبول طلب تسجيل الطالب {name} مبدئياً، وسيتم التواصل معكم لإكمال الإجراء.',
    registrationAcceptTemplate: settings.registrationAcceptTemplate || 'السلام عليكم، تم قبول الطالب {name} في حلقة {committee}. رقم الدخول: {login}.',
    registrationRejectTemplate: settings.registrationRejectTemplate || 'السلام عليكم، نعتذر عن قبول طلب تسجيل الطالب {name} حالياً.',
    weeklyHolidayDays: normalizeWeeklyHolidayDays(settings.weeklyHolidayDays),
    holidayTaskTypes: normalizeHolidayTaskTypes(settings.holidayTaskTypes),
    recitationSessionDays: normalizeWeekDayList(settings.recitationSessionDays, DEFAULT_RECITATION_SESSION_DAYS),
    quranTaskExecutionSource: [memorizationExecutionSource, reviewExecutionSource, linkExecutionSource, repeatExecutionSource]
      .every((source) => source === 'teacher') ? 'teacher' : 'student',
    memorizationExecutionSource,
    reviewExecutionSource,
    linkExecutionSource,
    repeatExecutionSource,
    hasStudentQuranExecution: [memorizationExecutionSource, reviewExecutionSource, linkExecutionSource, repeatExecutionSource]
      .some((source) => ['student', 'both'].includes(source)),
    recitationAmountDay: normalizeRecitationAmountDay(settings.recitationAmountDay),
    hideStudentMemorizationAmount: settings.hideStudentMemorizationAmount !== 'false',
    hideStudentReviewAmount: settings.hideStudentReviewAmount !== 'false',
    hideStudentLinkAmount: settings.hideStudentLinkAmount !== 'false',
    hideStudentAmounts: settings.hideStudentAmounts === 'true',
    studentTaskAmountEditable: settings.studentTaskAmountEditable !== 'false',
    studentReviewAmountEditable: settings.studentReviewAmountEditable !== 'false',
    studentLinkAmountEditable: false,
    allowQuranCompensation: settings.allowQuranCompensation !== 'false',
    allowQuranExtra: settings.allowQuranExtra === 'true',
    recitationAttendanceSource: settings.recitationAttendanceSource === 'teacher' ? 'teacher' : 'supervisor',
    currentTermStartDate: isValidDateOnly(settings.currentTermStartDate) ? settings.currentTermStartDate : '',
    quranPlanStartDate: isValidDateOnly(settings.quranPlanStartDate) ? settings.quranPlanStartDate : '',
    quranPlanEndDate: isValidDateOnly(settings.quranPlanEndDate) ? settings.quranPlanEndDate : '',
    narrationMaxScore: Math.max(1, Number(settings.narrationMaxScore || 100)),
    narrationWarningDeduction: Math.max(0, Number(settings.narrationWarningDeduction || 1)),
    narrationMistakeDeduction: Math.max(0, Number(settings.narrationMistakeDeduction || 5)),
    narrationStartTemplate: settings.narrationStartTemplate || 'السلام عليكم، بدأ {eventName} من {fromDate} إلى {toDate}.',
    narrationEndTemplate: settings.narrationEndTemplate || 'السلام عليكم، انتهى {eventName}.',
    narrationResultTemplate: settings.narrationResultTemplate || 'نتيجة {name} في {eventName}: {score} من 100، التقدير {rating}.',
    allowRepeatCountEditing: false,
    listeningEnabled: true,
    allowListeningCountEditing: false,
    ...Object.fromEntries(platformFeatureSettingKeys.map((key) => [key, true])),
  };
}

function publicSettingsForClient(settings) {
  return {
    attendanceManualEnabled: Boolean(settings.attendanceManualEnabled),
    rankingsVisible: Boolean(settings.studentRankingsVisible || settings.familyRankingsVisible),
    studentRankingsVisible: Boolean(settings.studentRankingsVisible),
    familyRankingsVisible: Boolean(settings.familyRankingsVisible),
    familyRankingMode: normalizeFamilyRankingMode(settings.familyRankingMode),
    rankingPointsVisible: Boolean(settings.rankingPointsVisible),
    pointsSystemEnabled: true,
    teacherManualPointsEnabled: Boolean(settings.teacherManualPointsEnabled),
    storeEnabled: Boolean(settings.storeEnabled),
    storePurchaseDeductsRanking: Boolean(settings.storePurchaseDeductsRanking),
    weeklyHolidayDays: normalizeWeeklyHolidayDays(settings.weeklyHolidayDays),
    holidayTaskTypes: normalizeHolidayTaskTypes(settings.holidayTaskTypes),
    recitationSessionDays: normalizeWeekDayList(settings.recitationSessionDays, DEFAULT_RECITATION_SESSION_DAYS),
    quranTaskExecutionSource: settings.quranTaskExecutionSource === 'teacher' ? 'teacher' : 'student',
    memorizationExecutionSource: normalizeQuranExecutionSource(settings.memorizationExecutionSource, 'teacher'),
    reviewExecutionSource: normalizeQuranExecutionSource(settings.reviewExecutionSource, 'student'),
    linkExecutionSource: normalizeQuranExecutionSource(settings.linkExecutionSource, 'student'),
    repeatExecutionSource: normalizeQuranExecutionSource(settings.memorizationExecutionSource, 'teacher'),
    hasStudentQuranExecution: hasStudentQuranExecution(settings),
    recitationAmountDay: normalizeRecitationAmountDay(settings.recitationAmountDay),
    hideStudentMemorizationAmount: settings.hideStudentMemorizationAmount !== false,
    hideStudentReviewAmount: settings.hideStudentReviewAmount !== false,
    hideStudentLinkAmount: settings.hideStudentLinkAmount !== false,
    hideStudentAmounts: Boolean(settings.hideStudentAmounts),
    studentTaskAmountEditable: Boolean(settings.studentTaskAmountEditable),
    studentReviewAmountEditable: Boolean(settings.studentReviewAmountEditable),
    studentLinkAmountEditable: Boolean(settings.studentLinkAmountEditable),
    allowQuranCompensation: Boolean(settings.allowQuranCompensation),
    allowQuranExtra: Boolean(settings.allowQuranExtra),
    recitationAttendanceSource: settings.recitationAttendanceSource === 'teacher' ? 'teacher' : 'supervisor',
    quranReferenceMode: settings.quranReferenceMode === 'page' ? 'page' : 'ayah',
    currentTermStartDate: isValidDateOnly(settings.currentTermStartDate) ? settings.currentTermStartDate : '',
    quranPlanStartDate: settings.quranPlanStartDate || '',
    quranPlanEndDate: settings.quranPlanEndDate || '',
    registrationEnabled: Boolean(settings.registrationEnabled),
    staffAttendanceSource: settings.staffAttendanceSource === 'teacher' ? 'teacher' : 'supervisor',
    staffAttendanceLateAfterAsrMinutes: Math.max(0, Number(settings.staffAttendanceLateAfterAsrMinutes ?? 50)),
    ...Object.fromEntries(platformFeatureSettingKeys.map((key) => [key, settings[key] !== false])),
  };
}

function parseBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeQuranPlanTrack(value) {
  const track = String(value || '').trim();
  return QURAN_PLAN_TRACKS.has(track) ? track : 'memorization';
}

function hasConfirmation(body, expectedText) {
  return String(body?.confirmText || '').trim() === expectedText;
}

function isStudentAttendedStatus(status) {
  return status === 'present' || status === 'late' || status === 'excused';
}

function normalizeManualAttendanceStatus(value, fallback = 'present') {
  return ['present', 'late', 'absent', 'excused'].includes(value) ? value : fallback;
}


async function canUseManualAttendance(req) {
  if (req.auth?.role === 'manager') return true;
  return ['supervisor', 'admin'].includes(req.auth?.role)
    && await hasSupervisorDashboardPermission(req.auth.id, 'manualAttendance');
}

async function resetAllProgramPoints(connection) {
  await rememberResetGradeKeys(connection);
  await connection.query("INSERT INTO app_settings (setting_key, setting_value) VALUES ('gradePointsResetDate', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [getSaudiDateTimeParts().date]);
  return runCountedStatements(connection, {
    pointTransactionsDeleted: 'DELETE FROM student_point_transactions',
    studentAwardsDeleted: 'DELETE FROM supervisor_student_point_awards',
    familyAwardsDeleted: 'DELETE FROM supervisor_family_point_awards',
    attendanceRowsReset: 'UPDATE attendance_records SET points = 0 WHERE points <> 0',
    quranTaskRowsReset: 'UPDATE student_quran_tasks SET points = 0 WHERE points <> 0',
    quranExecutionRowsReset: 'UPDATE student_quran_execution_segments SET points_awarded = 0 WHERE points_awarded <> 0',
    learningPathRowsReset: 'UPDATE student_path_progress SET earned_points = 0 WHERE earned_points <> 0',
    familyAchievementRowsReset: 'UPDATE family_achievements SET points = 0 WHERE points <> 0',
    studentBalancesReset: 'UPDATE students SET points = 0, store_balance = 0 WHERE points <> 0 OR store_balance <> 0',
    familyBalancesReset: 'UPDATE committees SET points = 0, student_points_contribution = 0 WHERE points <> 0 OR student_points_contribution <> 0',
  });
}

async function deleteProgramDataExceptCore(connection) {
  return runCountedStatements(connection, {
    operationalPushSubscriptionsDeleted: "DELETE FROM push_subscriptions WHERE user_role <> 'manager'",
    operationalSessionsDeleted: "DELETE FROM auth_sessions WHERE user_role <> 'manager'",
    notificationRecipientsDeleted: 'DELETE FROM app_notification_recipients',
    notificationsDeleted: 'DELETE FROM app_notifications',
    whatsAppMessagesDeleted: 'DELETE FROM whatsapp_messages',
    registrationRequestsDeleted: 'DELETE FROM registration_requests',
    studentAttendanceDeleted: 'DELETE FROM attendance_records',
    studentGradesDeleted: ['DELETE FROM student_daily_grades', 'DELETE FROM student_weekly_components', 'DELETE FROM grading_week_policies'],
    supervisorAttendanceDeleted: 'DELETE FROM supervisor_attendance_records',
    studentAchievementsDeleted: 'DELETE FROM student_achievements',
    familyAchievementsDeleted: 'DELETE FROM family_achievements',
    studentPathProgressDeleted: 'DELETE FROM student_path_progress',
    learningPathOptionsDeleted: 'DELETE FROM learning_path_options',
    learningPathQuestionsDeleted: 'DELETE FROM learning_path_questions',
    learningPathsDeleted: ['DELETE FROM learning_paths WHERE parent_path_id IS NOT NULL', 'DELETE FROM learning_paths'],
    reportArchivesDeleted: 'DELETE FROM report_archives',
    studentAwardsDeleted: 'DELETE FROM supervisor_student_point_awards',
    familyAwardsDeleted: 'DELETE FROM supervisor_family_point_awards',
    familyItemsDeleted: 'DELETE FROM supervisor_family_items',
    pointTransactionsDeleted: 'DELETE FROM student_point_transactions',
    familyLeaderAccountsDeleted: 'DELETE FROM family_leader_accounts',
    studentsDeleted: 'DELETE FROM students',
    familiesDeleted: 'DELETE FROM committees',
    staffAccountsDeleted: "DELETE FROM supervisors WHERE role <> 'manager'",
    activityLogsDeleted: 'DELETE FROM activity_logs',
  });
}

function isValidTimeString(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

async function acquireNamedLock(connection, name, timeout = 5) {
  const [[lock]] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [name, timeout]);
  if (Number(lock?.acquired) !== 1) {
    const error = new Error('العملية مشغولة حالياً، حاول مرة أخرى.');
    error.statusCode = 409;
    throw error;
  }
  return name;
}

async function releaseNamedLock(connection, name) {
  if (!name) return;
  try {
    await connection.query('SELECT RELEASE_LOCK(?)', [name]);
  } catch (error) {
    console.error('Failed to release named lock:', error);
  }
}

function parseGoogleMapsCoordinates(value = '') {
  const text = String(value).trim();
  if (!text) return null;

  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|query|ll|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /\/search\/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /\/dir\/[^@]*@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return { lat: Number(match[1]), lng: Number(match[2]) };
  }

  return null;
}

async function resolveGoogleMapsCoordinates(url) {
  if (!url) return null;
  const direct = parseGoogleMapsCoordinates(url);
  if (direct) return direct;

  const allowedHosts = new Set([
    'google.com',
    'www.google.com',
    'maps.google.com',
    'maps.app.goo.gl',
    'goo.gl',
  ]);
  const parseAllowedUrl = (value) => {
    try {
      const parsed = new URL(String(value || ''));
      return parsed.protocol === 'https:' && allowedHosts.has(parsed.hostname.toLowerCase())
        ? parsed
        : null;
    } catch {
      return null;
    }
  };
  const followAllowedRedirects = async (method) => {
    let current = parseAllowedUrl(url);
    if (!current) return null;

    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
      const response = await fetch(current, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
      const coordinates = parseGoogleMapsCoordinates(current.toString());
      if (coordinates) return coordinates;
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return parseGoogleMapsCoordinates(response.url);
      }
      const location = response.headers.get('location');
      if (!location) return null;
      current = parseAllowedUrl(new URL(location, current).toString());
      if (!current) return null;
    }
    return null;
  };

  try {
    return await followAllowedRedirects('HEAD') || await followAllowedRedirects('GET');
  } catch {
    return null;
  }
}

function distanceInMeters(from, to) {
  const earthRadius = 6371000;
  const toRad = (degree) => degree * Math.PI / 180;
  const deltaLat = toRad(to.lat - from.lat);
  const deltaLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function validateAttendanceLocation(settings, body) {
  if (!settings.attendanceAccountEnabled || !settings.attendanceLocationUrl) {
    return null;
  }

  if (settings.attendanceLocationLat === null || settings.attendanceLocationLng === null) {
    const error = new Error('رابط موقع التحضير غير مقروء. احفظ رابط Google Maps يحتوي على الإحداثيات ثم حاول مرة أخرى.');
    error.statusCode = 422;
    throw error;
  }

  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error('يجب السماح بالوصول للموقع لتسجيل التحضير.');
    error.statusCode = 422;
    throw error;
  }

  const distance = distanceInMeters(
    { lat: latitude, lng: longitude },
    { lat: settings.attendanceLocationLat, lng: settings.attendanceLocationLng }
  );
  if (distance > 200) {
    const error = new Error('لا يمكن تسجيل التحضير خارج نطاق الموقع المحدد.');
    error.statusCode = 403;
    throw error;
  }

  return Math.round(distance);
}

function timeToMinutes(value = '00:00') {
  const [hours = 0, minutes = 0] = String(value).split(':').map(Number);
  return (hours * 60) + minutes;
}

function isBeforeAttendanceStart(settings, checkInTime) {
  return timeToMinutes(checkInTime) < timeToMinutes(settings.attendanceStartTime);
}





async function getStudentPointFamilyContributionRows(connection) {
  const placeholders = FAMILY_ORIGIN_STUDENT_POINT_SOURCES.map(() => '?').join(', ');
  const [rows] = await connection.query(
    `
    SELECT
      studentContributions.committeeId,
      COALESCE(SUM(studentContributions.contribution), 0) AS total
    FROM (
      SELECT
        s.id,
        s.committee_id AS committeeId,
        GREATEST(
          0,
          COALESCE(SUM(CASE WHEN t.transaction_type = 'increase' THEN t.points ELSE -t.points END), 0)
        ) AS contribution
      FROM students s
      LEFT JOIN student_point_transactions t
        ON t.student_id = s.id
        AND (t.source_type IS NULL OR t.source_type NOT IN (${placeholders}))
      WHERE s.committee_id IS NOT NULL
      GROUP BY s.id, s.committee_id
    ) studentContributions
    WHERE studentContributions.contribution > 0
    GROUP BY studentContributions.committeeId
    `,
    FAMILY_ORIGIN_STUDENT_POINT_SOURCES
  );
  return rows.map((row) => ({
    committeeId: row.committeeId,
    total: Number(row.total || 0),
  })).filter((row) => row.total > 0);
}

async function getKnownDirectFamilyPointRows(connection) {
  const [rows] = await connection.query(
    `
    SELECT
      c.id AS committeeId,
      COALESCE(a.total, 0) + COALESCE(h.total, 0) AS total
    FROM committees c
    LEFT JOIN (
      SELECT committee_id, COALESCE(SUM(points), 0) AS total
      FROM supervisor_family_point_awards
      GROUP BY committee_id
    ) a ON a.committee_id = c.id
    LEFT JOIN (
      SELECT family_id, COALESCE(SUM(points), 0) AS total
      FROM family_achievements
      GROUP BY family_id
    ) h ON h.family_id = c.id
    `
  );
  return rows.map((row) => ({
    committeeId: row.committeeId,
    total: Number(row.total || 0),
  }));
}

async function getAppSettingValue(connection, key) {
  const [[row]] = await connection.query(
    'SELECT setting_value AS value FROM app_settings WHERE setting_key = ?',
    [key]
  );
  return row?.value;
}

async function setAppSettingValue(connection, key, value) {
  await connection.query(
    `
    INSERT INTO app_settings (setting_key, setting_value)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
    `,
    [key, value]
  );
}

async function reconcilePointSettingsOnStartup() {
  const connection = await db().getConnection();
  try {
    const settings = await loadSettings();
    await connection.beginTransaction();
    await syncStudentPointFamilyContributionSetting(connection, settings, settings);
    await syncFamilyPointStudentContributionSetting(connection, settings);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function syncStudentPointFamilyContributionSetting(connection, _previousSettings, nextSettings) {
  const isEnabled = Boolean(nextSettings?.studentPointsAddToFamily);
  const contributionRows = await getStudentPointFamilyContributionRows(connection);
  const contributionByFamily = new Map(
    contributionRows.map((row) => [String(row.committeeId), Number(row.total || 0)])
  );
  const directRows = await getKnownDirectFamilyPointRows(connection);
  const directByFamily = new Map(
    directRows.map((row) => [String(row.committeeId), Number(row.total || 0)])
  );
  const legacyReconciled = await getAppSettingValue(
    connection,
    STUDENT_POINTS_FAMILY_RECONCILED_SETTING
  ) === 'true';
  const [families] = await connection.query(
    `
    SELECT
      id AS committeeId,
      points,
      COALESCE(student_points_contribution, 0) AS appliedContribution
    FROM committees
    FOR UPDATE
    `
  );
  let affectedFamilies = 0;
  let totalDelta = 0;

  for (const family of families) {
    const familyId = String(family.committeeId);
    const contribution = contributionByFamily.get(familyId) || 0;
    const currentPoints = Number(family.points || 0);
    const currentApplied = Number(family.appliedContribution || 0);
    const directPoints = directByFamily.get(familyId) || 0;

    let delta;
    let nextApplied;

    if (isEnabled) {
      nextApplied = contribution;
      delta = contribution - currentApplied;
    } else {
      let removableContribution = currentApplied;
      if (removableContribution <= 0 && !legacyReconciled) {
        removableContribution = Math.min(
          contribution,
          Math.max(0, currentPoints - directPoints)
        );
      }
      nextApplied = 0;
      delta = -removableContribution;
    }

    if (!delta && nextApplied === currentApplied) continue;

    const [result] = await connection.query(
      `
      UPDATE committees
      SET
        points = GREATEST(0, points + ?),
        student_points_contribution = ?
      WHERE id = ?
      `,
      [delta, nextApplied, family.committeeId]
    );
    if (Number(result.affectedRows || 0) > 0) {
      affectedFamilies += 1;
      totalDelta += delta;
    }
  }

  await setAppSettingValue(
    connection,
    STUDENT_POINTS_FAMILY_RECONCILED_SETTING,
    isEnabled ? 'false' : 'true'
  );

  return { affectedFamilies, totalDelta };
}

async function getInactiveFamilyPointStudentContributionRows(connection, settings) {
  const addToStudents = Boolean(settings?.familyPointsAddToStudents);
  const addToAbsentStudents = Boolean(settings?.familyPointsAddToAbsentStudents);
  if (addToStudents && addToAbsentStudents) return [];

  const placeholders = FAMILY_POINT_STUDENT_CONTRIBUTION_SOURCES.map(() => '?').join(', ');
  const filters = [`t.source_type IN (${placeholders})`];
  const params = [...FAMILY_POINT_STUDENT_CONTRIBUTION_SOURCES];

  if (addToStudents && !addToAbsentStudents) {
    filters.push(`
      EXISTS (
        SELECT 1
        FROM attendance_records ar
        WHERE ar.student_id = t.student_id
          AND ar.record_date = t.transaction_date
          AND ar.status = 'absent'
      )
    `);
  }

  const [rows] = await connection.query(
    `
    SELECT
      t.student_id AS studentId,
      GREATEST(
        0,
        COALESCE(SUM(CASE WHEN t.transaction_type = 'increase' THEN t.points ELSE -t.points END), 0)
      ) AS inactivePoints
    FROM student_point_transactions t
    WHERE ${filters.map((filter) => `(${filter})`).join(' AND ')}
    GROUP BY t.student_id
    HAVING inactivePoints > 0
    `,
    params
  );

  return rows.map((row) => ({
    studentId: row.studentId,
    inactivePoints: Number(row.inactivePoints || 0),
  })).filter((row) => row.inactivePoints > 0);
}

async function syncFamilyPointStudentContributionSetting(connection, settings, extraStudentIds = []) {
  const today = getSaudiDateTimeParts().date;
  const inactiveRows = await getInactiveFamilyPointStudentContributionRows(connection, settings);
  const [existingRows] = await connection.query(
    `
    SELECT student_id AS studentId
    FROM student_point_transactions
    WHERE source_type = ?
    `,
    [FAMILY_POINTS_SETTING_ADJUSTMENT_SOURCE]
  );

  const inactiveByStudent = new Map(
    inactiveRows.map((row) => [String(row.studentId), Number(row.inactivePoints || 0)])
  );
  const affectedStudentIds = new Set([
    ...inactiveRows.map((row) => String(row.studentId)),
    ...existingRows.map((row) => String(row.studentId)),
    ...extraStudentIds.map(String),
  ]);

  for (const studentId of affectedStudentIds) {
    const inactivePoints = inactiveByStudent.get(studentId) || 0;
    const dedupeKey = `family-points-setting:${studentId}`;

    if (inactivePoints > 0) {
      await connection.query(
        `
        INSERT INTO student_point_transactions
          (student_id, supervisor_id, actor_role, actor_name, transaction_type, points, reason, transaction_date, source_type, source_id, dedupe_key)
        VALUES (?, NULL, 'system', 'النظام', 'deduction', ?, 'تعطيل تحويل نقاط الحلقة إلى الطلاب', ?, ?, NULL, ?)
        ON DUPLICATE KEY UPDATE
          transaction_type = 'deduction',
          points = VALUES(points),
          reason = VALUES(reason),
          transaction_date = VALUES(transaction_date),
          source_type = VALUES(source_type),
          source_id = VALUES(source_id)
        `,
        [studentId, inactivePoints, today, FAMILY_POINTS_SETTING_ADJUSTMENT_SOURCE, dedupeKey]
      );
    } else {
      await connection.query(
        `
        DELETE FROM student_point_transactions
        WHERE source_type = ? AND student_id = ?
        `,
        [FAMILY_POINTS_SETTING_ADJUSTMENT_SOURCE, studentId]
      );
    }

    await syncStudentPointBalance(connection, studentId);
  }
}

const studentPointSourceLabels = {
  grade: 'الدرجات',
  family_evaluation: 'تقييم الحلقة',
  family_achievement: 'وسام الحلقة',
  family_adjustment: 'تعديل نقاط الحلقة',
  family_points_setting_adjustment: 'تعطيل تحويل نقاط الحلقة إلى الطلاب',
  supervisor_award: 'إضافة نقاط من معلم',
  supervisor_deduction: 'خصم نقاط من معلم',
  manager_adjustment: 'تعديل نقاط من المدير',
  manual_award: 'منح نقاط من المدير',
  manual: 'إدخال يدوي',
  store_purchase: 'شراء من المتجر',
};
const FAMILY_POINTS_SETTING_ADJUSTMENT_SOURCE = 'family_points_setting_adjustment';
const STUDENT_POINTS_FAMILY_RECONCILED_SETTING = 'studentPointsFamilyContributionReconciled';
const FAMILY_POINT_STUDENT_CONTRIBUTION_SOURCES = [
  'family_adjustment',
  'family_evaluation',
];
const FAMILY_ORIGIN_STUDENT_POINT_SOURCES = [
  ...FAMILY_POINT_STUDENT_CONTRIBUTION_SOURCES,
  FAMILY_POINTS_SETTING_ADJUSTMENT_SOURCE,
];

function getStudentPointSourceLabel(sourceType = '') {
  return studentPointSourceLabels[sourceType] || 'مصدر غير محدد';
}

function normalizePointReason(reason = '', sourceType = '') {
  const text = String(reason || '').trim();
  if (!text || /^\?+$/.test(text) || (text.match(/\?/g) || []).length >= Math.max(3, text.length / 2)) {
    return getStudentPointSourceLabel(sourceType);
  }
  return text;
}

async function deleteStudentWithRelations(connection, studentId) {
  const tables = [
    'whatsapp_messages',
    'attendance_records',
    'student_achievements',
    'student_path_progress',
    'supervisor_student_point_awards',
    'student_point_transactions',
    'student_quran_prior_memorization',
  ];

  for (const table of tables) {
    await connection.query(`DELETE FROM ${table} WHERE student_id = ?`, [studentId]);
  }

  const [result] = await connection.query('DELETE FROM students WHERE id = ?', [studentId]);
  return result.affectedRows;
}

async function applyFamilyPointDelta(connection, committeeId, delta, settings, date, context = {}) {
  if (!delta) return { affectedStudents: 0, totalEffectiveDelta: 0 };
  await connection.query(
    `
    UPDATE committees
    SET points = GREATEST(0, points + ?)
    WHERE id = ?
    `,
    [delta, committeeId]
  );
  if (!settings.familyPointsAddToStudents && !context.forceStudentPropagation) {
    return { affectedStudents: 0, totalEffectiveDelta: 0 };
  }
  const includeAbsentStudents = context.includeAbsentStudents ?? settings.familyPointsAddToAbsentStudents;
  const [students] = await connection.query(
    `
    SELECT id
    FROM students
    WHERE committee_id = ?
      AND (
        ? = 1
        OR NOT EXISTS (
          SELECT 1
          FROM attendance_records ar
          WHERE ar.student_id = students.id
            AND ar.record_date = ?
            AND ar.status = 'absent'
        )
      )
    FOR UPDATE
    `,
    [committeeId, includeAbsentStudents ? 1 : 0, date]
  );
  let affectedStudents = 0;
  let totalEffectiveDelta = 0;
  for (const student of students) {
    const effectiveDelta = await applyStudentPointDelta(
      connection,
      student.id,
      delta,
      settings,
      { propagateToFamily: false, date }
    );
    if (effectiveDelta) {
      affectedStudents += 1;
      totalEffectiveDelta += effectiveDelta;
      await logStudentPointTransaction(connection, {
        studentId: student.id,
        supervisorId: context.supervisorId || null,
        actorRole: context.actorRole || 'system',
        actorName: context.actorName || 'النظام',
        type: effectiveDelta > 0 ? 'increase' : 'deduction',
        points: Math.abs(effectiveDelta),
        reason: context.reason || 'نقاط تقييم الحلقة',
        date,
        sourceType: context.sourceType || 'family_evaluation',
        sourceId: context.sourceId || null,
      });
    }
  }
  return { affectedStudents, totalEffectiveDelta };
}


async function loadSettings(queryExecutor = db()) {
  const [rows] = await queryExecutor.query('SELECT setting_key, setting_value FROM app_settings');
  const policies = readPlatformPoliciesFromRows(rows);
  const gradingPolicyRow = rows.find((row) => row.setting_key === GRADING_POLICY_SETTING_KEY);
  const [[weekPolicy]] = await queryExecutor.query('SELECT policy_json AS policy FROM grading_week_policies WHERE week_start = ?', [weekStartOf(getSaudiDateTimeParts().date)]);
  const scheduleDays = scheduleDaysFromGradingPolicy(parseGradingPolicy(weekPolicy?.policy || gradingPolicyRow?.setting_value));
  const settings = enforcePointsFeatureDependencies(
    applyPlatformPolicies({ ...normalizeSettings(rows), ...scheduleDays }, policies),
  );
  return {
    ...settings,
    platformPolicies: policies,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.get('/api/native-update', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json(await nativeUpdatePolicy(req.query.app, req.query.platform)); }
  catch (error) { next(error); }
});

async function reconcileCurrentQuranPlanTasks() {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const settings = await loadSettings();
    const date = getSaudiDateTimeParts().date;
    const [students] = await connection.query(
      "SELECT DISTINCT student_id AS studentId FROM student_quran_plans WHERE status IN ('active', 'completed') ORDER BY student_id",
    );
    for (const student of students) {
      const plan = await getActivePlanForStudent(connection, Number(student.studentId));
      if (!plan) continue;
      await ensureStudentPlanTasks(connection, plan, date, settings);
      await ensureRepeatTasksForMemorizationDate(connection, plan, date);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function reconcileAllTenantStartupState() {
  await forEachActiveTenant(async () => {
    await limitActiveAuthSessionLifetimes();
    await reconcilePointSettingsOnStartup();
    await reconcileCurrentQuranPlanTasks();
  });
}

app.use('/api/calls', callRouter);

function getNarrationRating(score, maxScore = 100) {
  const value = Number(score || 0) * 100 / Math.max(1, Number(maxScore));
  if (value >= 90) return 'ممتاز';
  if (value >= 80) return 'جيد جدًا';
  if (value >= 70) return 'جيد';
  return 'يحتاج متابعة';
}

function summarizeNarrationStudents(students = []) {
  const summary = {
    total: students.length,
    completed: 0,
    inProgress: 0,
    unfinished: 0,
  };
  students.forEach((student) => {
    if (student.status === 'completed') summary.completed += 1;
    else if (student.status === 'in_progress') summary.inProgress += 1;
  });
  summary.unfinished = summary.inProgress;
  return summary;
}

async function canAccessNarrationCommittee(auth, committeeId) {
  if (['manager', 'admin'].includes(auth?.role)) return true;
  if (auth?.role !== 'supervisor') return false;
  const [[row]] = await db().query(
    'SELECT 1 AS allowed FROM supervisor_committees WHERE supervisor_id = ? AND committee_id = ? LIMIT 1',
    [auth.id, committeeId]
  );
  return Boolean(row);
}

async function getNarrationEvent(eventId, auth) {
  const [[event]] = await db().query(
    `
    SELECT e.id, e.name, DATE_FORMAT(e.start_date, '%Y-%m-%d') AS startDate,
      DATE_FORMAT(e.end_date, '%Y-%m-%d') AS endDate, e.scope, e.committee_id AS committeeId,
      e.status, e.created_by_name AS createdByName, DATE_FORMAT(e.created_at, '%Y-%m-%d %H:%i') AS createdAt
    FROM narration_events e WHERE e.id = ? LIMIT 1
    `,
    [eventId]
  );
  if (!event) return null;
  const params = [eventId];
  let accessFilter = '';
  if (auth?.role === 'supervisor') {
    accessFilter = 'AND EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.supervisor_id = ? AND sc.committee_id = es.committee_id)';
    params.push(auth.id);
  }
  const [students] = await db().query(
    `
    SELECT es.id, es.student_id AS studentId, es.student_name AS studentName,
      es.committee_id AS committeeId, es.committee_name AS committeeName, es.status,
      es.total_faces AS totalFaces, es.final_score AS finalScore, es.final_rating AS finalRating,
      DATE_FORMAT(es.archived_at, '%Y-%m-%d %H:%i') AS archivedAt
    FROM narration_event_students es
    WHERE es.event_id = ? ${accessFilter}
    ORDER BY es.committee_name ASC, es.student_name ASC
    `,
    params
  );
  if (students.length) {
    const ids = students.map((student) => Number(student.id));
    const [parts] = await db().query(
      `
      SELECT p.id, p.event_student_id AS eventStudentId, p.juz_number AS juzNumber,
        p.start_surah AS startSurah, p.start_ayah AS startAyah, p.start_page AS startPage,
        p.end_surah AS endSurah, p.end_ayah AS endAyah, p.end_page AS endPage,
        p.faces, p.warning_count AS warningCount, p.mistake_count AS mistakeCount,
        p.score, p.evaluation_mode AS evaluationMode, p.word_marks_json AS wordMarks,
        qsf.name_arabic AS startSurahName, qst.name_arabic AS endSurahName,
        COALESCE(p.evaluated_by_name, sp.name) AS evaluatorName, DATE_FORMAT(p.evaluated_at, '%Y-%m-%d %H:%i') AS evaluatedAt
      FROM narration_event_parts p
      LEFT JOIN supervisors sp ON sp.id = p.evaluated_by
      LEFT JOIN quran_surahs qsf ON qsf.surah_number = p.start_surah
      LEFT JOIN quran_surahs qst ON qst.surah_number = p.end_surah
      WHERE p.event_student_id IN (${ids.map(() => '?').join(', ')})
      ORDER BY p.event_student_id ASC, p.juz_number ASC, p.start_page ASC
      `,
      ids
    );
    const [reciters] = await db().query(
      'SELECT event_student_id AS entryId, actor_name AS name FROM narration_event_reciters WHERE event_student_id IN (?)', [ids]
    );
    const juzRanges = await getQuranJuzRanges(db());
    const juzByNumber = new Map(juzRanges.map((range) => [Number(range.juz), range]));
    const byStudent = new Map();
    parts.forEach((part) => {
      const key = String(part.eventStudentId);
      if (!byStudent.has(key)) byStudent.set(key, []);
      const juzRange = juzByNumber.get(Number(part.juzNumber));
      const isFullJuz = Boolean(juzRange
        && Number(part.startSurah) === Number(juzRange.startSurah)
        && Number(part.startAyah) === Number(juzRange.startAyah)
        && Number(part.endSurah) === Number(juzRange.endSurah)
        && Number(part.endAyah) === Number(juzRange.endAyah));
      const rangeLabel = isFullJuz ? getJuzLabel(part.juzNumber) : `${getJuzLabel(part.juzNumber)} — ${formatTaskPreview({
        fromSurah: part.startSurah,
        fromAyah: part.startAyah,
        toSurah: part.endSurah,
        toAyah: part.endAyah,
        fromSurahName: part.startSurahName,
        toSurahName: part.endSurahName,
      })}`;
      byStudent.get(key).push({
        ...part,
        id: String(part.id),
        faces: Number(part.faces),
        score: part.score === null ? null : Number(part.score),
        wordMarks: parseStoredWordMarks(part.wordMarks),
        isFullJuz,
        rangeLabel,
      });
    });
    students.forEach((student) => {
      student.id = String(student.id);
      student.studentId = String(student.studentId);
      student.committeeId = student.committeeId ? String(student.committeeId) : null;
      student.totalFaces = Number(student.totalFaces || 0);
      student.finalScore = student.finalScore === null ? null : Number(student.finalScore);
      student.parts = byStudent.get(student.id) || [];
      student.reciterNames = [...new Set(reciters.filter(row => String(row.entryId) === student.id).map(row => row.name))];
    });
  }
  if (auth?.role === 'supervisor' && students.length === 0) return null;
  const settings = await loadSettings();
  return {
    ...event,
    id: String(event.id),
    committeeId: event.committeeId ? String(event.committeeId) : null,
    students,
    recitationMode: 'both',
    evaluationPolicy: {
      maxScore: Number(settings.narrationMaxScore),
      warningDeduction: Number(settings.narrationWarningDeduction),
      mistakeDeduction: Number(settings.narrationMistakeDeduction),
    },
    summary: summarizeNarrationStudents(students),
  };
}

async function sendNarrationMessages(event, { type, eventStudentId = null, eventStudentIds = null, committeeId = null } = {}) {
  const settings = await loadSettings();
  const allowedStudentIds = Array.isArray(eventStudentIds)
    ? new Set(eventStudentIds.map(String))
    : null;
  const targets = event.students.filter((student) => {
    if (committeeId && String(student.committeeId) !== String(committeeId)) return false;
    if (allowedStudentIds && !allowedStudentIds.has(String(student.id))) return false;
    if (type === 'result') return student.id === String(eventStudentId) && student.status === 'completed';
    return true;
  });
  const _resolveTemplate = () => {
    if (type === 'start') {
      return settings.narrationStartTemplate;
    }
    if (type === 'end') {
      return settings.narrationEndTemplate;
    }
    return settings.narrationResultTemplate;
  };
  const template = _resolveTemplate();
  const notificationTitles = {
    start: 'بدأ يوم السرد',
    end: 'انتهى يوم السرد',
    result: 'نتيجة يوم السرد',
  };
  if (template) {
    await Promise.all(targets.map((student) => createStudentAccountNotification(db(), {
      studentId: student.studentId,
      title: notificationTitles[type],
      body: fillWhatsAppTemplate(template, {
        name: student.studentName,
        committeeName: student.committeeName,
        eventName: event.name,
        fromDate: event.startDate,
        toDate: event.endDate,
        score: student.finalScore ?? '-',
        rating: student.finalRating || '-',
      }),
      dedupeKey: `narration_${type}:${event.id}:${student.studentId}`,
      actor: { role: 'system', name: event.createdByName || 'النظام' },
    })));
  }
  if (targets.length > 0 && template) {
    await refreshWhatsAppState({ waitMs: 10000 });
    if (!getWhatsAppRuntime().client || !whatsAppState.ready) {
      throw whatsAppDeliveryError(WHATSAPP_LINK_REQUIRED_MESSAGE, 409);
    }
  }
  let sent = 0;
  for (const student of targets) {
    const status = await notifyStudentGuardian(student.studentId, template, {
      eventName: event.name,
      fromDate: event.startDate,
      toDate: event.endDate,
      score: student.finalScore ?? '-',
      rating: student.finalRating || '-',
      messageType: `narration_${type}`,
    });
    if (status === 'sent') sent += 1;
  }
  return { sentCount: sent, totalCount: targets.length };
}

app.get('/api/narration-events', requireNarrationAccess, async (req, res, next) => {
  try {
    const [rows] = await db().query(
      `
      SELECT e.id, e.name, DATE_FORMAT(e.start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(e.end_date, '%Y-%m-%d') AS endDate, e.status,
        COUNT(es.id) AS studentsCount
      FROM narration_events e
      LEFT JOIN narration_event_students es ON es.event_id = e.id
      ${req.auth?.role === 'supervisor' ? 'LEFT JOIN supervisor_committees sc ON sc.committee_id = es.committee_id AND sc.supervisor_id = ?' : ''}
      ${req.auth?.role === 'supervisor' ? 'WHERE sc.supervisor_id IS NOT NULL' : ''}
      GROUP BY e.id
      ORDER BY (e.status = 'open') DESC, e.start_date DESC, e.id DESC
      `,
      req.auth?.role === 'supervisor' ? [req.auth.id] : []
    );
    res.json(rows.map((row) => ({ ...row, id: String(row.id), studentsCount: Number(row.studentsCount || 0) })));
  } catch (error) { next(error); }
});

app.get('/api/narration-events/:id', requireNarrationAccess, async (req, res, next) => {
  try {
    const event = await getNarrationEvent(Number(req.params.id), req.auth);
    if (!event) return res.status(404).json({ message: 'يوم السرد غير موجود.' });
    res.json(event);
  } catch (error) { next(error); }
});

app.get('/api/narration-events/:eventId/parts/:partId/ayahs', requireNarrationAccess, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const eventId = Number(req.params.eventId || 0);
    const partId = Number(req.params.partId || 0);
    const [[part]] = await connection.query(
      `SELECT p.start_surah AS startSurah, p.start_ayah AS startAyah, p.start_page AS startPage,
        p.end_surah AS endSurah, p.end_ayah AS endAyah, p.end_page AS endPage,
        p.word_marks_json AS wordMarks, es.committee_id AS committeeId
       FROM narration_event_parts p
       JOIN narration_event_students es ON es.id = p.event_student_id
       WHERE p.id = ? AND es.event_id = ? LIMIT 1`,
      [partId, eventId]
    );
    if (!part) return res.status(404).json({ message: 'مقطع السرد غير موجود.' });
    if (!await canAccessNarrationCommittee(req.auth, part.committeeId)) return res.status(403).json({ message: 'لا يمكنك تقييم هذا الطالب.' });
    res.json(await buildQuranRangeMushafData(connection, part, part.wordMarks));
  } catch (error) { next(error); } finally { connection.release(); }
});

app.delete('/api/narration-events/:id', requireNarrationAccess, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const eventId = Number(req.params.id || 0);
    const [[event]] = await connection.query(
      'SELECT id, status, created_by_role AS createdByRole, created_by_id AS createdById FROM narration_events WHERE id = ? FOR UPDATE',
      [eventId]
    );
    if (event?.status !== 'archived') {
      return res.status(404).json({ message: 'الأرشيف غير موجود.' });
    }
    if (
      req.auth?.role === 'supervisor'
      && (event.createdByRole !== 'supervisor' || Number(event.createdById) !== Number(req.auth.id))
    ) {
      return res.status(403).json({ message: 'لا يمكنك حذف هذا الأرشيف.' });
    }
    const [students] = await connection.query('SELECT id FROM narration_event_students WHERE event_id = ? FOR UPDATE', [eventId]);
    for (const student of students) await syncNarrationGradePoints(connection, student.id, 0, req.auth);
    const [result] = await connection.query("DELETE FROM narration_events WHERE id = ? AND status = 'archived'", [eventId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'الأرشيف غير موجود.' });
    await connection.commit();
    res.json({ ok: true });
  } catch (error) { next(error); }
  finally { try { await connection.rollback(); } finally { connection.release(); } }
});

app.post('/api/narration-events', requireNarrationAccess, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const name = String(req.body.name || '').trim().slice(0, 180);
    const startDate = String(req.body.startDate || '');
    const endDate = String(req.body.endDate || '');
    const scope = req.body.scope === 'committee' ? 'committee' : 'all';
    const _resolveRequestedCommitteeIds = () => {
      if (scope === 'committee') {
        return [...new Set((Array.isArray(req.body.committeeIds) ? req.body.committeeIds : [req.body.committeeId]).map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
      }
      return [];
    };
    const requestedCommitteeIds = _resolveRequestedCommitteeIds();
    if (!name || !isValidDateOnly(startDate) || !isValidDateOnly(endDate) || startDate > endDate || (scope === 'committee' && !requestedCommitteeIds.length)) {
      return res.status(422).json({ message: 'بيانات يوم السرد غير مكتملة.' });
    }
    const committeeIds = scope === 'committee'
      ? await ensureCommitteeIdsExist(connection, requestedCommitteeIds)
      : [];
    const hasCommitteeAccess = req.auth?.role !== 'supervisor'
      || scope === 'all'
      || (await Promise.all(committeeIds.map((id) => canAccessNarrationCommittee(req.auth, id)))).every(Boolean);
    if (!hasCommitteeAccess) {
      return res.status(403).json({ message: 'اختر إحدى حلقاتك لإنشاء يوم السرد.' });
    }
    const committeeId = committeeIds.length === 1 ? committeeIds[0] : null;
    await connection.beginTransaction();
    const [created] = await connection.query(
      `INSERT INTO narration_events (name, start_date, end_date, scope, committee_id, created_by_role, created_by_id, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, startDate, endDate, scope, committeeId, req.auth.role, Number(req.auth.id || 0), req.auth.name || 'مستخدم']
    );
    const filters = [];
    const params = [];
    if (committeeIds.length) {
      filters.push(`s.committee_id IN (${committeeIds.map(() => '?').join(', ')})`);
      params.push(...committeeIds);
    }
    if (req.auth?.role === 'supervisor') {
      filters.push('EXISTS (SELECT 1 FROM supervisor_committees sc WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id)');
      params.push(req.auth.id);
    }
    const [students] = await connection.query(
      `SELECT s.id, s.name, s.committee_id AS committeeId, c.name AS committeeName FROM students s LEFT JOIN committees c ON c.id = s.committee_id ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''} ORDER BY s.name`,
      params
    );
    const juzRanges = await getQuranJuzRanges(connection);
    let included = 0;
    included = await createNarrationStudentEntries({ students, connection, startDate, juzRanges, created, included });
    await connection.commit();
    const event = await getNarrationEvent(created.insertId, req.auth);
    if (event) void sendNarrationMessages(event, { type: 'start' }).catch(() => undefined);
    res.status(201).json({ ok: true, id: String(created.insertId), studentsCount: included, messageQueued: Boolean(event) });
  } catch (error) {
    await connection.rollback(); next(error);
  } finally { connection.release(); }
});

app.put('/api/narration-events/:eventId/parts/:partId', requireNarrationAccess, (_req, res) => {
  res.status(410).json({ message: 'يُقيّم الجزء كاملًا مرة واحدة؛ حدّث التطبيق وأعد فتح يوم السرد.' });
});

/** The narration final score earns the same number of points; clearing it removes them. Caller owns the transaction. */
async function syncNarrationGradePoints(connection, eventStudentId, finalScore, actor = {}) {
  const [[entry]] = await connection.query(`SELECT es.student_id AS studentId, DATE_FORMAT(e.start_date, '%Y-%m-%d') AS eventDate
    FROM narration_event_students es JOIN narration_events e ON e.id = es.event_id WHERE es.id = ?`, [eventStudentId]);
  if (!entry) return;
  await syncGradePoints(connection, {
    studentId: Number(entry.studentId),
    dedupeKey: narrationGradeDedupeKey(eventStudentId),
    points: finalScore ?? 0,
    date: entry.eventDate,
    reason: GRADE_POINT_REASONS.narration,
    actor,
  });
}

/** Each juz is one graded unit; its final score is the mean of the juz scores. */
async function refreshNarrationStudentResult(connection, eventStudentId, actor, maxScore) {
  const [juzRows] = await connection.query(
    `SELECT juz_number AS juzNumber, COUNT(*) AS total, SUM(score IS NOT NULL) AS evaluated, AVG(score) AS juzScore
     FROM narration_event_parts WHERE event_student_id = ? GROUP BY juz_number`,
    [eventStudentId]
  );
  const complete = juzRows.length > 0 && juzRows.every((row) => Number(row.evaluated) === Number(row.total));
  const evaluated = juzRows.filter(row => Number(row.evaluated) > 0);
  const finalScore = evaluated.length
    ? evaluated.reduce((sum, row) => sum + Number(row.juzScore), 0) / evaluated.length
    : null;
  await connection.query(
    'UPDATE narration_event_students SET status = ?, final_score = ?, final_rating = ? WHERE id = ?',
    [complete ? 'completed' : 'in_progress', finalScore, finalScore !== null ? getNarrationRating(finalScore, maxScore) : null, eventStudentId]
  );
  await syncNarrationGradePoints(connection, eventStudentId, complete ? finalScore : null, actor);
  return { complete, finalScore };
}

app.put('/api/narration-events/:eventId/students/:studentEntryId/juz/:juzNumber', requireNarrationAccess, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const eventId = Number(req.params.eventId);
    const entryId = Number(req.params.studentEntryId);
    const juzNumber = Number(req.params.juzNumber);
    const [parts] = await connection.query(
      `SELECT p.id, p.event_student_id AS eventStudentId, es.committee_id AS committeeId, e.status,
        p.start_surah AS startSurah, p.start_ayah AS startAyah, p.start_page AS startPage,
        p.end_surah AS endSurah, p.end_ayah AS endAyah, p.end_page AS endPage
       FROM narration_event_parts p JOIN narration_event_students es ON es.id = p.event_student_id JOIN narration_events e ON e.id = es.event_id
       WHERE es.id = ? AND e.id = ? AND p.juz_number = ? AND es.archived_at IS NULL
       ORDER BY p.start_page ASC, p.id ASC`,
      [entryId, eventId, juzNumber]
    );
    if (!parts.length || parts[0].status !== 'open') return res.status(404).json({ message: 'التقييم غير متاح.' });
    if (!await canAccessNarrationCommittee(req.auth, parts[0].committeeId)) return res.status(403).json({ message: 'لا يمكنك تقييم هذا الطالب.' });
    const evaluationMode = ['mushaf', 'count'].includes(req.body.evaluationMode) ? req.body.evaluationMode : null;
    if (!evaluationMode) return res.status(422).json({ message: 'اختر طريقة تسجيل نتيجة السرد.' });
    const marksByPart = new Map();
    if (evaluationMode === 'mushaf') {
      const submitted = new Map((Array.isArray(req.body.parts) ? req.body.parts : [])
        .map((item) => [String(item?.partId), item?.wordMarks]));
      if ([...submitted.keys()].some((partId) => !parts.some((part) => String(part.id) === partId))) {
        return res.status(422).json({ message: 'مقاطع الجزء غير صحيحة.' });
      }
      for (const part of parts) {
        const normalized = await normalizeQuranRangeWordMarks(connection, part, submitted.get(String(part.id)) || []);
        if (normalized === null) return res.status(422).json({ message: 'تحديد أخطاء المصحف غير صحيح.' });
        marksByPart.set(String(part.id), normalized);
      }
    } else if (Array.isArray(req.body.parts) || Array.isArray(req.body.wordMarks)) {
      return res.status(422).json({ message: 'لا ترسل علامات كلمات مع النتيجة اليدوية.' });
    }
    const allMarks = [...marksByPart.values()].flat();
    const warnings = evaluationMode === 'mushaf'
      ? allMarks.filter((mark) => mark.markType === 'warning').length
      : Math.max(0, Number(req.body.warningCount || 0));
    const mistakes = evaluationMode === 'mushaf'
      ? allMarks.filter((mark) => isMistakeMark(mark.markType)).length
      : Math.max(0, Number(req.body.mistakeCount || 0));
    if (![warnings, mistakes].every(value => Number.isInteger(value) && value >= 0 && value <= 1000)) return res.status(422).json({ message: 'الأخطاء والتنبيهات يجب أن تكون أعدادًا صحيحة من 0 إلى 1000.' });
    const settings = await loadSettings();
    const score = Math.max(0, Number(settings.narrationMaxScore) - warnings * Number(settings.narrationWarningDeduction) - mistakes * Number(settings.narrationMistakeDeduction));
    await connection.beginTransaction();
    for (const [index, part] of parts.entries()) {
      const partMarks = marksByPart.get(String(part.id)) || [];
      // Manual counts belong to the juz as a whole, so they are kept once on its first segment.
      const partWarnings = evaluationMode === 'mushaf' ? partMarks.filter((mark) => mark.markType === 'warning').length : (index === 0 ? warnings : 0);
      const partMistakes = evaluationMode === 'mushaf' ? partMarks.filter((mark) => isMistakeMark(mark.markType)).length : (index === 0 ? mistakes : 0);
      await connection.query(
        'UPDATE narration_event_parts SET warning_count = ?, mistake_count = ?, score = ?, notes = NULL, evaluated_by = ?, evaluated_by_name = ?, evaluated_at = NOW(), evaluation_mode = ?, word_marks_json = ? WHERE id = ?',
        [partWarnings, partMistakes, score, Number(req.auth.id || 0) || null, req.auth.name || (req.auth.role === 'manager' ? 'المدير' : 'المعلم'), evaluationMode, evaluationMode === 'mushaf' ? JSON.stringify(partMarks) : null, part.id]
      );
    }
    const { complete, finalScore } = await refreshNarrationStudentResult(connection, entryId, req.auth, settings.narrationMaxScore);
    await connection.commit();
    if (complete) {
      void getNarrationEvent(eventId, req.auth)
        .then((updatedEvent) => updatedEvent && sendNarrationMessages(updatedEvent, { type: 'result', eventStudentId: String(entryId) }))
        .catch(() => undefined);
    }
    res.json({ ok: true, score, warningCount: warnings, mistakeCount: mistakes, finalScore, finalRating: complete ? getNarrationRating(finalScore, settings.narrationMaxScore) : null });
  } catch (error) { await connection.rollback().catch(() => undefined); next(error); } finally { connection.release(); }
});

app.put('/api/narration-events/:eventId/students/:studentEntryId/status', requireNarrationAccess, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const status = req.body.status === 'in_progress' ? req.body.status : null;
    if (!status) return res.status(422).json({ message: 'الحالة غير صحيحة.' });
    const entryId = Number(req.params.studentEntryId);
    const [[entry]] = await connection.query('SELECT committee_id AS committeeId, archived_at AS archivedAt FROM narration_event_students WHERE id = ? AND event_id = ? LIMIT 1', [entryId, Number(req.params.eventId)]);
    if (!entry || entry.archivedAt || !await canAccessNarrationCommittee(req.auth, entry.committeeId)) return res.status(403).json({ message: 'لا يمكنك تعديل هذا الطالب.' });
    await connection.beginTransaction();
    const [result] = await connection.query(`UPDATE narration_event_students es JOIN narration_events e ON e.id = es.event_id SET es.status = IF(es.status = 'completed', es.status, ?) WHERE es.id = ? AND e.id = ? AND e.status = 'open' AND es.archived_at IS NULL`, [status, entryId, Number(req.params.eventId)]);
    if (!result.affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: 'الطالب غير موجود.' });
    }
    await connection.query(
      'INSERT INTO narration_event_reciters (event_student_id, actor_role, actor_id, actor_name) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE actor_name = VALUES(actor_name)',
      [entryId, req.auth.role, Number(req.auth.id || 0), req.auth.name || (req.auth.role === 'manager' ? 'المدير' : 'المعلم')]
    );
    await connection.commit();
    res.json({ ok: true });
  } catch (error) { await connection.rollback().catch(() => undefined); next(error); } finally { connection.release(); }
});

app.post('/api/narration-events/:id/archive', requireNarrationAccess, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const eventId = Number(req.params.id);
    const committeeId = Number(req.body.committeeId || 0) || null;
    const event = await getNarrationEvent(eventId, req.auth);
    if (event?.status !== 'open') return res.status(404).json({ message: 'يوم السرد غير متاح.' });
    const targets = event.students.filter((student) => !student.archivedAt && (!committeeId || Number(student.committeeId) === committeeId));
    if (!targets.length) {
      if (committeeId) return res.status(404).json({ message: 'لا توجد حلقة مفتوحة مطابقة.' });
      const [[remainingGlobal]] = await connection.query('SELECT COUNT(*) AS count FROM narration_event_students WHERE event_id = ? AND archived_at IS NULL', [eventId]);
      if (Number(remainingGlobal.count || 0) > 0) return res.status(404).json({ message: 'لا توجد حلقات مفتوحة متاحة لحسابك.' });
      await connection.query(`UPDATE narration_events SET status = 'archived', archived_at = NOW() WHERE id = ? AND status = 'open'`, [eventId]);
      return res.json({ ok: true, archivedAll: true, archivedStudents: 0, messageResult: { sentCount: 0, totalCount: 0 } });
    }
    const archiveSummary = summarizeNarrationStudents(targets);

    await connection.beginTransaction();
    const ids = targets.map((student) => Number(student.id));
    await connection.query(
      `UPDATE narration_event_students SET archived_at = NOW() WHERE event_id = ? AND id IN (${ids.map(() => '?').join(', ')}) AND archived_at IS NULL`,
      [eventId, ...ids]
    );
    const [[remaining]] = await connection.query('SELECT COUNT(*) AS count FROM narration_event_students WHERE event_id = ? AND archived_at IS NULL', [eventId]);
    const archivedAll = Number(remaining.count || 0) === 0;
    if (archivedAll) {
      await connection.query(`UPDATE narration_events SET status = 'archived', archived_at = NOW() WHERE id = ? AND status = 'open'`, [eventId]);
    }
    await connection.commit();
    void sendNarrationMessages(event, {
      type: 'end',
      eventStudentIds: targets.map((student) => student.id),
      committeeId,
    }).catch(error => console.error('Narration end delivery failed:', error.message));
    res.json({ ok: true, archivedAll, archivedStudents: targets.length, archiveSummary });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/narration-events/:id/send', requireNarrationAccess, async (req, res, next) => {
  try {
    const event = await getNarrationEvent(Number(req.params.id), req.auth);
    if (!event) return res.status(404).json({ message: 'يوم السرد غير موجود.' });
    const type = ['start', 'end', 'result'].includes(req.body.type) ? req.body.type : null;
    if (!type) return res.status(422).json({ message: 'نوع الرسالة غير صحيح.' });
    const result = await sendNarrationMessages(event, { type, eventStudentId: req.body.eventStudentId });
    res.json({ ok: true, ...result });
  } catch (error) { next(error); }
});

app.use('/api/notifications', notificationRouter);
app.use('/api/notification-management', notificationManagementRouter);

app.get('/api/student-notifications', async (req, res, next) => {
  try {
    if (req.auth?.role !== 'student') return res.status(403).json({ message: 'الإشعارات متاحة للطالب فقط.' });
    const [rows] = await db().query(
      `SELECT n.id, n.title, COALESCE(r.body_override, n.body) AS body,
        DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i') AS createdAt,
        r.read_at IS NOT NULL AS isRead
       FROM app_notification_recipients r
       JOIN app_notifications n ON n.id = r.notification_id
       WHERE r.user_role = 'student' AND r.user_id = ?
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 50`,
      [req.auth.id],
    );
    res.json(rows.map((row) => ({ ...row, id: String(row.id), isRead: Boolean(row.isRead) })));
  } catch (error) {
    next(error);
  }
});

app.post('/api/student-notifications/:id/read', async (req, res, next) => {
  try {
    if (req.auth?.role !== 'student') return res.status(403).json({ message: 'الإشعارات متاحة للطالب فقط.' });
    await db().query(
      `UPDATE app_notification_recipients SET read_at = COALESCE(read_at, NOW())
       WHERE notification_id = ? AND user_role = 'student' AND user_id = ?`,
      [Number(req.params.id || 0), req.auth.id],
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/site-config', (_req, res) => {
  res.json(currentSiteConfig());
});

app.use('/api/auth', tenantAuthRouter);

app.get('/api/dashboard-permissions/me', async (req, res, next) => {
  try {
    let permissions;
    if (req.auth?.role === 'manager') {
      permissions = DASHBOARD_PERMISSION_KEYS;
    } else if (['supervisor', 'admin', 'reciter'].includes(req.auth?.role)) {
        permissions = await getSupervisorDashboardPermissions(req.auth?.id);
      } else {
        permissions = [];
      }
    res.json({ permissions });
  } catch (error) {
    next(error);
  }
});

app.get('/api/dashboard-permissions', requirePermission, async (_req, res, next) => {
  try {
    const [supervisors] = await db().query(
      `
      SELECT id, name, login_number AS loginNumber, job_title AS jobTitle
      FROM supervisors
      WHERE role = 'supervisor'
      ORDER BY name ASC
      `
    );
    const [permissions] = await db().query(
      `
      SELECT supervisor_id AS supervisorId, permission_key AS permissionKey
      FROM supervisor_dashboard_permissions
      ORDER BY permission_key ASC
      `
    );
    const permissionMap = new Map();
    permissions.forEach((permission) => {
      const key = Number(permission.supervisorId);
      const list = permissionMap.get(key) || [];
      list.push(permission.permissionKey);
      permissionMap.set(key, list);
    });

    res.json({
      permissions: DASHBOARD_PERMISSION_KEYS,
      supervisors: supervisors.map((supervisor) => ({
        ...supervisor,
        permissions: cleanDashboardPermissions(permissionMap.get(Number(supervisor.id)) || []),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/dashboard-permissions/:supervisorId', requirePermission, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const supervisorId = Number(req.params.supervisorId);
    const permissions = cleanDashboardPermissions(req.body.permissions);
    const [[supervisor]] = await connection.query("SELECT id FROM supervisors WHERE id = ? AND role = 'supervisor'", [supervisorId]);
    if (!supervisor) return res.status(404).json({ message: 'المعلم غير موجود.' });

    await connection.beginTransaction();
    await connection.query('DELETE FROM supervisor_dashboard_permissions WHERE supervisor_id = ?', [supervisorId]);
    if (permissions.length) {
      await connection.query(
        `
        INSERT INTO supervisor_dashboard_permissions (supervisor_id, permission_key)
        VALUES ?
        `,
        [permissions.map((permission) => [supervisorId, permission])]
      );
    }
    await connection.commit();
    res.json({ ok: true, supervisorId, permissions });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/dashboard-bootstrap', async (req, res, next) => {
  try {
    if (!['manager', 'supervisor', 'admin', 'reciter'].includes(req.auth?.role)) {
      return res.status(403).json({ message: 'غير مصرح بالدخول إلى لوحة التحكم.' });
    }
    const _resolveConditional6 = () => {
      if (req.auth?.role === 'manager') {
        return Promise.resolve(DASHBOARD_PERMISSION_KEYS);
      }
      if (['supervisor', 'admin', 'reciter'].includes(req.auth?.role)) {
        return getSupervisorDashboardPermissions(req.auth?.id);
      }
      return Promise.resolve([]);
    };
    const [settings, permissions] = await Promise.all([
      loadSettings(),
      _resolveConditional6(),
    ]);
    res.json({
      settings: req.auth?.role === 'manager' ? settings : publicSettingsForClient(settings),
      permissions,
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/student-news', createStudentNewsRouter({}));
app.use('/api/account-deletion', accountDeletionRouter);
app.use('/api/backups', createBackupRouter({ requireManager: requirePermission }));
if (siteConfig.features?.store !== false) {
  app.use('/api/store', createStoreRouter({
    loadSettings,
    applyStudentPointDelta,
    logStudentPointTransaction,
    getToday: () => getSaudiDateTimeParts().date,
  }));
}
app.use('/api/offline-student', createOfflineStudentRouter({
  loadSettings,
  getToday: () => getSaudiDateTimeParts().date,
}));
app.use('/api/staff-attendance', createStaffAttendanceRouter({
  loadSettings,
  getNow: getSaudiDateTimeParts,
}));
app.use('/api/recitation-preferences', createStaffRecitationPreferencesRouter({ loadSettings }));
app.use('/api/grading', createGradingRouter({ db, loadSettings, today: () => getSaudiDateTimeParts().date }));
app.use('/api/offline-recitation', createOfflineRecitationRouter({
  getToday: () => getSaudiDateTimeParts().date,
  prepareOfflineWindow: async ({ connection, accountId, fromDate, cacheDays }) => {
    const settings = await loadSettings();
    await ensureSupervisorTeacherModeTasks(
      connection,
      accountId,
      fromDate,
      addUtcDays(fromDate, cacheDays),
      settings,
    );
  },
}));

app.get('/api/settings/notification-administrators', requirePermission('settings'), async (_req, res, next) => {
  try {
    const [people] = await db().query("SELECT id, name FROM supervisors WHERE is_active = 1 AND role IN ('manager', 'admin') ORDER BY name");
    res.json(people);
  } catch (error) { next(error); }
});

app.get('/api/settings', requirePermission('settings'), async (_req, res, next) => {
  try {
    res.json(await loadSettings());
  } catch (error) {
    next(error);
  }
});

app.get('/api/settings/execution-reminder-students', requirePermission('settings'), async (_req, res, next) => {
  try {
    const [students] = await db().query(
      `SELECT s.id, s.name, c.name AS committeeName
       FROM students s
       LEFT JOIN committees c ON c.id = s.committee_id
       ORDER BY s.name ASC`,
    );
    res.json({ students });
  } catch (error) {
    next(error);
  }
});

app.get('/api/public-settings', async (_req, res, next) => {
  try {
    res.json(publicSettingsForClient(await loadSettings()));
  } catch (error) {
    next(error);
  }
});

app.post('/api/settings/reset-points', requirePermission('settings'), async (req, res, next) => {
  if (!hasConfirmation(req.body, RESET_POINTS_CONFIRM_TEXT)) {
    return res.status(422).json({ message: `اكتب "${RESET_POINTS_CONFIRM_TEXT}" لتأكيد العملية.` });
  }

  const connection = await db().getConnection();
  let lockName = null;
  let transactionStarted = false;
  try {
    lockName = await acquireNamedLock(connection, `${siteKey}:settings-maintenance`, 10);
    await connection.beginTransaction();
    transactionStarted = true;
    const summary = await resetAllProgramPoints(connection);
    await connection.commit();
    transactionStarted = false;
    res.json({ ok: true, message: 'تمت إعادة تعيين نقاط جميع الطلاب والحلقات.', summary });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    next(error);
  } finally {
    await releaseNamedLock(connection, lockName);
    connection.release();
  }
});

app.post('/api/settings/delete-program-data', requirePermission, async (req, res, next) => {
  if (!hasConfirmation(req.body, DELETE_PROGRAM_DATA_CONFIRM_TEXT)) {
    return res.status(422).json({ message: `اكتب "${DELETE_PROGRAM_DATA_CONFIRM_TEXT}" لتأكيد العملية.` });
  }

  const connection = await db().getConnection();
  let lockName = null;
  let transactionStarted = false;
  try {
    lockName = await acquireNamedLock(connection, `${siteKey}:settings-maintenance`, 10);
    await connection.beginTransaction();
    transactionStarted = true;
    const summary = await deleteProgramDataExceptCore(connection);
    await connection.commit();
    transactionStarted = false;
    res.json({ ok: true, message: 'تم حذف بيانات البرنامج مع إبقاء المسابقات الثقافية والأساسيات.', summary });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    next(error);
  } finally {
    await releaseNamedLock(connection, lockName);
    connection.release();
  }
});

app.post('/api/settings/end-term', requirePermission('settings'), async (req, res, next) => {
  if (req.auth?.role !== 'manager') return res.status(403).json({ message: 'إنهاء الفصل متاح للمدير فقط.' });
  const confirmText = String(req.body.confirmText || '').trim();
  if (confirmText !== 'إنهاء الفصل') {
    return res.status(422).json({ message: 'اكتب "إنهاء الفصل" لتأكيد العملية.' });
  }

  const today = getSaudiDateTimeParts().date;
  const connection = await db().getConnection();
  let lockName = null;
  let transactionStarted = false;
  try {
    lockName = await acquireNamedLock(connection, `${siteKey}:end-term`, 10);
    const safetyBackup = await createDatabaseBackup({ actorName: `قبل إنهاء الفصل - ${req.auth.name || 'المدير'}`, tiers: ['safety'], skipRetention: true });
    await connection.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    await connection.beginTransaction();
    transactionStarted = true;
    const [[existingArchive]] = await connection.query(
      'SELECT id, title FROM report_archives WHERE period_to = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
      [today]
    );
    if (existingArchive) {
      const duplicateError = new Error('تم إنهاء الفصل لهذا اليوم مسبقًا.');
      duplicateError.status = 409;
      throw duplicateError;
    }
    const settings = await loadSettings(connection);
    const firstReportDate = await getFirstReportDate(connection);
    const startDate = isValidDateOnly(settings.currentTermStartDate)
      ? settings.currentTermStartDate
      : firstReportDate;
    // ISO dates are strings; numeric Math.min would return NaN.
    const effectiveStartDate = startDate.localeCompare(today) > 0 ? today : startDate;
    const progressReport = await buildProgressReport({
      from: effectiveStartDate,
      to: today,
      committeeId: 'all',
      auth: req.auth,
      queryExecutor: connection,
    });
    const overviewReport = await buildOverviewReport({
      from: effectiveStartDate,
      to: today,
      queryExecutor: connection,
    });
    const title = `أرشيف ${effectiveStartDate} إلى ${today}`;
    const [archiveResult] = await connection.query(
      `
      INSERT INTO report_archives
        (title, period_from, period_to, progress_report_json, overview_report_json, created_by_role, created_by_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        title,
        effectiveStartDate,
        today,
        JSON.stringify(progressReport),
        JSON.stringify(overviewReport),
        req.auth?.role || null,
        req.auth?.id || null,
      ]
    );
    const conversionSummary = await convertActivePlansToPriorMemorization(connection);
    const pointsSummary = await resetAllProgramPoints(connection);
    const nextTermStartDate = addUtcDays(today, 1);
    await connection.query(
      `
      INSERT INTO app_settings (setting_key, setting_value)
      VALUES ('currentTermStartDate', ?)
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
      `,
      [nextTermStartDate]
    );
    await connection.commit();
    transactionStarted = false;
    res.json({
      ok: true,
      archive: {
        id: archiveResult.insertId,
        title,
        from: effectiveStartDate,
        to: today,
        nextTermStartDate,
      },
      summary: { ...conversionSummary, ...pointsSummary },
      safetyBackupId: safetyBackup.id,
    });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    next(error);
  } finally {
    await releaseNamedLock(connection, lockName);
    connection.release();
  }
});

app.put('/api/settings', requirePermission('settings'), async (req, res, next) => {
  const connection = await db().getConnection();
  let transactionStarted = false;
  try {
    const previousSettings = await loadSettings();
    const eventNotifications = normalizeEventNotifications(req.body.eventNotifications ?? previousSettings.eventNotifications);

    const { studentRankingsVisible, familyRankingsVisible } = requestedRankingVisibility(req);
    const { teacherMemorizationRecitationMode, teacherReviewRecitationMode, teacherLinkRecitationMode, reciterMemorizationRecitationMode, reciterReviewRecitationMode, reciterLinkRecitationMode } = retainedRecitationModes(previousSettings);
    const _resolveStaffAttendanceSource = () => {
      if (req.body.staffAttendanceSource === undefined) {
        return previousSettings.staffAttendanceSource;
      }
      if (req.body.staffAttendanceSource === 'teacher') {
        return 'teacher';
      }
      return 'supervisor';
    };
    const _resolveQuranReferenceMode = () => {
      if (req.body.quranReferenceMode === undefined) {
        if (previousSettings.quranReferenceMode === 'page') {
          return 'page';
        }
        return 'ayah';
      }
      if (req.body.quranReferenceMode === 'page') {
        return 'page';
      }
      return 'ayah';
    };
    const buildRewardSettingsUpdateValues = buildRewardSettingsUpdate(req, studentRankingsVisible, familyRankingsVisible, previousSettings);
    const buildAttendanceSettingsUpdateValues = buildAttendanceSettingsUpdate(req, _resolveStaffAttendanceSource, previousSettings);
    const buildNotificationSettingsUpdateValues = buildNotificationSettingsUpdate(req, previousSettings, _resolveQuranReferenceMode);
    const buildRegistrationSettingsUpdateValues = buildRegistrationSettingsUpdate(req, previousSettings);
    const buildExecutionSourceSettingsUpdateValues = buildExecutionSourceSettingsUpdate(req, previousSettings);
    const buildExecutionEditingSettingsUpdateValues = buildExecutionEditingSettingsUpdate(req, previousSettings);
    const buildEvaluationSettingsUpdateValues = buildEvaluationSettingsUpdate({ req, previousSettings, teacherMemorizationRecitationMode, teacherReviewRecitationMode, teacherLinkRecitationMode, reciterMemorizationRecitationMode, reciterReviewRecitationMode, reciterLinkRecitationMode });
    const settings = {
      eventNotifications,
      ...buildRewardSettingsUpdateValues,
      ...buildAttendanceSettingsUpdateValues,
      ...buildNotificationSettingsUpdateValues,
      ...buildRegistrationSettingsUpdateValues,
      ...buildExecutionSourceSettingsUpdateValues,
      ...buildExecutionEditingSettingsUpdateValues,
      ...buildEvaluationSettingsUpdateValues
    };

    platformFeatureSettingKeys.forEach((key) => {
      settings[key] = true;
    });
    Object.assign(settings, applyPlatformPolicies(settings, previousSettings.platformPolicies || {}));
    Object.assign(settings, enforcePointsFeatureDependencies(settings));

    settings.quranTaskExecutionSource = [
      settings.memorizationExecutionSource,
      settings.reviewExecutionSource,
      settings.linkExecutionSource,
      settings.repeatExecutionSource,
    ].every((source) => source === 'teacher') ? 'teacher' : 'student';
    const resolveAttendanceLocationSettingsResult = await resolveAttendanceLocationSettings({ settings, res });
    if (resolveAttendanceLocationSettingsResult) { return resolveAttendanceLocationSettingsResult; }
    const rejectInvalidAttendanceSettingsResult = await rejectInvalidAttendanceSettings({ settings, res });
    if (rejectInvalidAttendanceSettingsResult) { return rejectInvalidAttendanceSettingsResult; }
    const rejectMissingMessageTemplatesResult = await rejectMissingMessageTemplates({ settings, res });
    if (rejectMissingMessageTemplatesResult) { return rejectMissingMessageTemplatesResult; }
    const rejectEmptyActivitySchedulesResult = await rejectEmptyActivitySchedules({ settings, res });
    if (rejectEmptyActivitySchedulesResult) { return rejectEmptyActivitySchedulesResult; }
    const rejectInvalidEvaluationSettingsResult = await rejectInvalidEvaluationSettings({ settings, res });
    if (rejectInvalidEvaluationSettingsResult) { return rejectInvalidEvaluationSettingsResult; }
    await connection.beginTransaction();
    transactionStarted = true;

    await connection.query(
      `
      INSERT INTO app_settings (setting_key, setting_value)
      VALUES
        ('maxSupervisorStudentPoints', ?),
        ('maxDailyStudentPoints', ?),
        ('maxSupervisorFamilyItemsPoints', ?),
        ('maxSupervisorDeductionPoints', ?),
        ('familyPointsAddToStudents', ?),
        ('familyPointsAddToAbsentStudents', ?),
        ('studentPointsAddToFamily', ?),
        ('familyEvaluationScope', ?),
        ('activityLogEnabled', ?),
        ('rankingsVisible', ?),
        ('studentRankingsVisible', ?),
        ('familyRankingsVisible', ?),
        ('familyRankingMode', ?),
        ('rankingPointsVisible', ?),
        ('storeEnabled', ?),
        ('storePurchaseDeductsRanking', ?),
        ('attendanceDays', ?),
        ('attendanceManualEnabled', ?),
        ('attendanceAccountEnabled', ?),
        ('allowEarlyAttendance', ?),
        ('attendanceStartTime', ?),
        ('attendanceLocationUrl', ?),
        ('attendanceLocationLat', ?),
        ('attendanceLocationLng', ?),
        ('attendanceAbsentTemplate', ?),
        ('automaticAbsenceMessageEnabled', ?),
        ('automaticExecutionMessageEnabled', ?),
        ('automaticExecutionMessageTime', ?),
        ('executionReminderTemplate', ?),
        ('quranReferenceMode', ?),
        ('registrationEnabled', ?),
        ('registrationPreAcceptTemplate', ?),
        ('registrationAcceptTemplate', ?),
        ('registrationRejectTemplate', ?),
        ('weeklyHolidayDays', ?),
        ('holidayTaskTypes', ?),
        ('recitationSessionDays', ?),
        ('quranTaskExecutionSource', ?),
        ('recitationAmountDay', ?),
        ('studentTaskAmountEditable', ?),
        ('allowQuranCompensation', ?),
        ('allowQuranExtra', ?),
        ('recitationAttendanceSource', ?),
        ('teacherMemorizationRecitationMode', ?),
        ('teacherReviewRecitationMode', ?),
        ('teacherLinkRecitationMode', ?),
        ('reciterMemorizationRecitationMode', ?),
        ('reciterReviewRecitationMode', ?),
        ('reciterLinkRecitationMode', ?),
        ('memorizationRecitationMode', ?),
        ('masteryRecitationMode', ?),
        ('reviewRecitationMode', ?),
        ('linkRecitationMode', ?),
        ('narrationMaxScore', ?),
        ('narrationWarningDeduction', ?),
        ('narrationMistakeDeduction', ?),
        ('narrationStartTemplate', ?),
        ('narrationEndTemplate', ?),
        ('narrationResultTemplate', ?),
        ('memorizationRepeatCount', ?),
        ('masteryRepeatCount', ?),
        ('allowRepeatCountEditing', ?)
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
      `,
      [
        String(settings.maxSupervisorStudentPoints),
        String(settings.maxDailyStudentPoints),
        String(settings.maxSupervisorFamilyItemsPoints),
        String(settings.maxSupervisorDeductionPoints),
        String(settings.familyPointsAddToStudents),
        String(settings.familyPointsAddToAbsentStudents),
        String(settings.studentPointsAddToFamily),
        settings.familyEvaluationScope,
        String(settings.activityLogEnabled),
        String(settings.rankingsVisible),
        String(settings.studentRankingsVisible),
        String(settings.familyRankingsVisible),
        settings.familyRankingMode,
        String(settings.rankingPointsVisible),
        String(settings.storeEnabled),
        String(settings.storePurchaseDeductsRanking),
        JSON.stringify(settings.attendanceDays),
        String(settings.attendanceManualEnabled),
        String(settings.attendanceAccountEnabled),
        String(settings.allowEarlyAttendance),
        String(settings.attendanceStartTime),
        settings.attendanceLocationUrl,
        settings.attendanceLocationLat === null ? '' : String(settings.attendanceLocationLat),
        settings.attendanceLocationLng === null ? '' : String(settings.attendanceLocationLng),
        settings.attendanceAbsentTemplate,
        String(settings.automaticAbsenceMessageEnabled),
        String(settings.automaticExecutionMessageEnabled),
        String(settings.automaticExecutionMessageTime),
        settings.executionReminderTemplate,
        settings.quranReferenceMode,
        String(settings.registrationEnabled),
        settings.registrationPreAcceptTemplate,
        settings.registrationAcceptTemplate,
        settings.registrationRejectTemplate,
        JSON.stringify(settings.weeklyHolidayDays),
        JSON.stringify(settings.holidayTaskTypes),
        JSON.stringify(settings.recitationSessionDays),
        settings.quranTaskExecutionSource,
        settings.recitationAmountDay,
        String(settings.studentTaskAmountEditable),
        String(settings.allowQuranCompensation),
        String(settings.allowQuranExtra),
        settings.recitationAttendanceSource,
        settings.teacherMemorizationRecitationMode,
        settings.teacherReviewRecitationMode,
        settings.teacherLinkRecitationMode,
        settings.reciterMemorizationRecitationMode,
        settings.reciterReviewRecitationMode,
        settings.reciterLinkRecitationMode,
        settings.memorizationRecitationMode,
        settings.masteryRecitationMode,
        settings.reviewRecitationMode,
        settings.linkRecitationMode,
        String(settings.narrationMaxScore),
        String(settings.narrationWarningDeduction),
        String(settings.narrationMistakeDeduction),
        settings.narrationStartTemplate,
        settings.narrationEndTemplate,
        settings.narrationResultTemplate,
        String(settings.memorizationRepeatCount),
        String(settings.masteryRepeatCount),
        String(settings.allowRepeatCountEditing),
      ]
    );

    await connection.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES ${platformFeatureSettingKeys.map(() => '(?, ?)').join(', ')}
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      platformFeatureSettingKeys.flatMap((key) => [key, String(settings[key] !== false)]),
    );

    await connection.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES
        ('memorizationListeningCount', ?),
        ('masteryListeningCount', ?),
        ('allowListeningCountEditing', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [
        String(settings.memorizationListeningCount),
        String(settings.masteryListeningCount),
        String(settings.allowListeningCountEditing),
      ],
    );

    await connection.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES
        ('memorizationExecutionSource', ?),
        ('reviewExecutionSource', ?),
        ('linkExecutionSource', ?),
        ('repeatExecutionSource', ?),
        ('hideStudentMemorizationAmount', ?),
        ('hideStudentReviewAmount', ?),
        ('hideStudentLinkAmount', ?),
        ('hideStudentAmounts', ?),
        ('studentReviewAmountEditable', ?),
        ('studentLinkAmountEditable', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [
        settings.memorizationExecutionSource,
        settings.reviewExecutionSource,
        settings.linkExecutionSource,
        settings.repeatExecutionSource,
        String(settings.hideStudentMemorizationAmount),
        String(settings.hideStudentReviewAmount),
        String(settings.hideStudentLinkAmount),
        String(settings.hideStudentAmounts),
        String(settings.studentReviewAmountEditable),
        String(settings.studentLinkAmountEditable),
      ],
    );

    await connection.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES
        ('staffAttendanceSource', ?),
        ('staffAttendanceLocationUrl', ?),
        ('staffAttendanceLocationLat', ?),
        ('staffAttendanceLocationLng', ?),
        ('staffAttendanceLateAfterAsrMinutes', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [
        settings.staffAttendanceSource,
        settings.staffAttendanceLocationUrl,
        settings.staffAttendanceLocationLat === null ? '' : String(settings.staffAttendanceLocationLat),
        settings.staffAttendanceLocationLng === null ? '' : String(settings.staffAttendanceLocationLng),
        String(settings.staffAttendanceLateAfterAsrMinutes),
      ]
    );

    await connection.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES
        ('teacherManualPointsEnabled', ?),
        ('teacherManualPointsTermLimit', ?),
        ('teacherPointTypes', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [
        String(settings.teacherManualPointsEnabled),
        String(settings.teacherManualPointsTermLimit),
        JSON.stringify(settings.teacherPointTypes),
      ],
    );

    await connection.query(
      `INSERT INTO app_settings (setting_key, setting_value)
       VALUES ('executionReminderExcludedStudentIds', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [JSON.stringify(settings.executionReminderExcludedStudentIds)],
    );

    await connection.query("INSERT INTO app_settings (setting_key, setting_value) VALUES ('eventNotifications', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)", [JSON.stringify(eventNotifications)]);
    await syncStudentPointFamilyContributionSetting(connection, previousSettings, settings);
    await syncFamilyPointStudentContributionSetting(connection, settings);
    await connection.commit();

    res.json({ ...settings, platformPolicies: previousSettings.platformPolicies || {} });
  } catch (error) {
    if (transactionStarted) {
      await connection.rollback();
    }
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/administrators', requirePermission('administrators'), async (_req, res, next) => {
  try {
    const [rows] = await db().query(
      `
      SELECT
        id,
        name,
        login_number AS loginNumber,
        national_id AS nationalId,
        phone,
        job_title AS jobTitle,
        role
      FROM supervisors
      WHERE role = 'admin'
      ORDER BY created_at DESC
      `
    );
    const ids = rows.map((row) => Number(row.id)).filter(Boolean);
    const permissionMap = new Map();
    if (ids.length > 0) {
      const [permissions] = await db().query(
        `
        SELECT supervisor_id AS supervisorId, permission_key AS permissionKey
        FROM supervisor_dashboard_permissions
        WHERE supervisor_id IN (${ids.map(() => '?').join(',')})
        `,
        ids
      );
      permissions.forEach((permission) => {
        const key = Number(permission.supervisorId);
        if (!permissionMap.has(key)) permissionMap.set(key, []);
        permissionMap.get(key).push(permission.permissionKey);
      });
    }

    res.json(rows.map((row) => ({
      ...row,
      permissions: cleanAdministratorDashboardPermissions(permissionMap.get(Number(row.id)) || []),
    })));
  } catch (error) {
    next(error);
  }
});

app.post('/api/administrators', requirePermission('administrators'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const { name, loginNumber, nationalId, phone, jobTitle, permissions } = normalizeAdministratorAccount(req.body);

    await connection.beginTransaction();
    await assertAdministratorScope(connection, req.auth, { targetId: req.params.id, permissions });
    await ensureLoginNumberIsAvailable(connection, loginNumber);
    const [result] = await connection.query(
      `
      INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role)
      VALUES (?, ?, ?, ?, ?, 'admin')
      `,
      [name, loginNumber, nationalId, phone, jobTitle]
    );
    if (permissions.length) {
      await connection.query(
        'INSERT INTO supervisor_dashboard_permissions (supervisor_id, permission_key) VALUES ?',
        [permissions.map((permission) => [result.insertId, permission])]
      );
    }
    await connection.commit();
    res.status(201).json({ id: result.insertId, name, loginNumber, nationalId, phone, jobTitle, role: 'admin', permissions });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.put('/api/administrators/:id', requirePermission('administrators'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const { name, loginNumber, nationalId, phone, jobTitle, permissions } = normalizeAdministratorAccount(req.body);

    await connection.beginTransaction();
    await assertAdministratorScope(connection, req.auth, { targetId: req.params.id, permissions });
    const [[administrator]] = await connection.query(
      'SELECT id, role, login_number AS loginNumber FROM supervisors WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!administrator) {
      await connection.rollback();
      return res.status(404).json({ message: 'الإداري غير موجود.' });
    }
    if (administrator.role === 'manager') {
      await connection.rollback();
      return res.status(409).json({ message: 'حساب المدير كامل الصلاحيات ولا يتم تعديله من هنا.' });
    }
    if (administrator.role !== 'admin') {
      await connection.rollback();
      return res.status(409).json({ message: 'هذا الحساب ليس إدارياً.' });
    }
    await ensureLoginNumberIsAvailable(connection, loginNumber, { type: 'supervisor', id: req.params.id });

    await connection.query(
      `
      UPDATE supervisors
      SET name = ?, login_number = ?, national_id = ?, phone = ?, job_title = ?, role = 'admin'
      WHERE id = ?
      `,
      [name, loginNumber, nationalId, phone, jobTitle, req.params.id]
    );
    await connection.query('DELETE FROM supervisor_dashboard_permissions WHERE supervisor_id = ?', [req.params.id]);
    if (permissions.length) {
      await connection.query(
        'INSERT INTO supervisor_dashboard_permissions (supervisor_id, permission_key) VALUES ?',
        [permissions.map((permission) => [req.params.id, permission])]
      );
    }
    if (String(administrator.loginNumber || '').trim() !== loginNumber) {
      await revokeAuthSessionsForUser(connection, 'admin', req.params.id);
    }
    await connection.commit();
    res.json({ ok: true, id: Number(req.params.id), permissions });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.delete('/api/administrators/:id', requirePermission('administrators'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const [[administrator]] = await connection.query('SELECT id, role FROM supervisors WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!administrator) {
      await connection.rollback();
      return res.status(404).json({ message: 'الإداري غير موجود.' });
    }
    if (administrator.role === 'manager') {
      await connection.rollback();
      return res.status(409).json({ message: 'لا يمكن حذف حساب المدير.' });
    }
    if (administrator.role !== 'admin') {
      await connection.rollback();
      return res.status(409).json({ message: 'هذا الحساب ليس إدارياً.' });
    }
    await assertAdministratorScope(connection, req.auth, { targetId: req.params.id });
    await connection.query("DELETE FROM auth_sessions WHERE user_role = 'admin' AND user_id = ?", [req.params.id]);
    await connection.query('DELETE FROM supervisors WHERE id = ?', [req.params.id]);
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/homepage-stats', async (_req, res, next) => {
  try {
    const [rows] = await db().query('SELECT setting_value FROM app_settings WHERE setting_key = ?', ['homepageStats']);
    const rawStats = rows[0]?.setting_value || '[]';
    if (rawStats === LEGACY_HOMEPAGE_STATS_JSON) {
      res.json([]);
      return;
    }
    try {
      const stats = JSON.parse(rawStats);
      res.json(Array.isArray(stats) ? stats : []);
    } catch {
      res.json([]);
    }
  } catch (error) {
    next(error);
  }
});

app.get('/api/committees', async (_req, res, next) => {
  try {
    const [rows] = await db().query(`
      SELECT
        id,
        name,
        points
      FROM committees
      ORDER BY name ASC
    `);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/registration/public', async (_req, res, next) => {
  try {
    const settings = await loadSettings();
    const juzRanges = settings.registrationEnabled ? await getQuranJuzRangesForClient(db()) : [];
    res.json({
      enabled: Boolean(settings.registrationEnabled),
      juzRanges,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/registration/public', async (req, res, next) => {
  const connection = await db().getConnection();
  let registrationLock;
  try {
    const settings = await loadSettings();
    if (!settings.registrationEnabled) {
      return res.status(403).json({ message: 'التسجيل مغلق حالياً.' });
    }

    const person = normalizeRegistrationPerson(req.body);
    registrationLock = await acquireNamedLock(connection, `nukhab:registration:${crypto.createHash('sha256').update(getDatabaseContext().databaseName).digest('hex').slice(0, 30)}`);
    const [[existingStudent]] = person.nationalId
      ? await connection.query('SELECT id FROM students WHERE national_id = ? LIMIT 1', [person.nationalId])
      : [[]];
    if (existingStudent) {
      return res.status(409).json({ message: 'يوجد طالب مسجل بهذا الرقم.' });
    }
    const [[existingRequest]] = person.nationalId
      ? await connection.query('SELECT id FROM registration_requests WHERE national_id = ? LIMIT 1', [person.nationalId])
      : await connection.query('SELECT id FROM registration_requests WHERE name = ? AND guardian_phone <=> ? AND age = ? LIMIT 1', [person.name, person.guardianPhone, person.age]);
    if (existingRequest) {
      return res.status(409).json({ message: 'يوجد طلب تسجيل قائم لهذا الطالب.' });
    }

    const memorization = await normalizeRegistrationMemorization(connection, req.body.memorization || {});
    const [result] = await connection.query(
      `
      INSERT INTO registration_requests (name, guardian_phone, national_id, age, memorization_json)
      VALUES (?, ?, ?, ?, ?)
      `,
      [person.name, person.guardianPhone, person.nationalId, person.age, JSON.stringify(memorization)]
    );
    res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    next(error);
  } finally {
    await releaseNamedLock(connection, registrationLock);
    connection.release();
  }
});

app.get('/api/registration-requests', requirePermission('registrationRequests'), async (_req, res, next) => {
  try {
    const [rows] = await db().query(
      `
      SELECT
        id,
        name,
        guardian_phone AS guardianPhone,
        national_id AS nationalId,
        age,
        memorization_json AS memorizationJson,
        test_results_json AS testResultsJson,
        DATE_FORMAT(preliminary_sent_at, '%Y-%m-%d %H:%i:%s') AS preliminarySentAt,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS createdAt
      FROM registration_requests
      ORDER BY created_at DESC, id DESC
      `
    );
    const [settings, juzRanges] = await Promise.all([loadSettings(), getQuranJuzRangesForClient(db())]);
    res.json({
      registrationEnabled: Boolean(settings.registrationEnabled),
      requests: rows.map((row) => serializeRegistrationRequest(row, { juzRanges })),
    });
  } catch (error) {
    next(error);
  }
});

app.put('/api/registration-requests/config', requirePermission('registrationRequests'), async (req, res, next) => {
  try {
    const enabled = parseBoolean(req.body.registrationEnabled);
    await db().query(
      `
      INSERT INTO app_settings (setting_key, setting_value)
      VALUES ('registrationEnabled', ?)
      ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)
      `,
      [String(enabled)]
    );
    res.json({ registrationEnabled: enabled });
  } catch (error) {
    next(error);
  }
});

app.post('/api/registration-requests/:id/preliminary-accept', requirePermission('registrationRequests'), async (req, res, next) => {
  try {
    const request = await getRegistrationRequestById(db(), req.params.id);
    if (!request) return res.status(404).json({ message: 'طلب التسجيل غير موجود.' });
    const settings = await loadSettings();
    const delivery = await notifyRegistrationRequestPhone(request, settings.registrationPreAcceptTemplate, {
      messageType: 'registration_pre_accept',
    });
    await db().query('UPDATE registration_requests SET preliminary_sent_at = NOW() WHERE id = ?', [request.id]);
    res.json({ ok: true, deliveryStatus: delivery.status });
  } catch (error) {
    next(error);
  }
});

app.post('/api/registration-requests/:id/reject', requirePermission('registrationRequests'), async (req, res, next) => {
  try {
    const request = await getRegistrationRequestById(db(), req.params.id);
    if (!request) return res.status(404).json({ message: 'طلب التسجيل غير موجود.' });
    const settings = await loadSettings();
    const delivery = await notifyRegistrationRequestPhone(request, settings.registrationRejectTemplate, {
      messageType: 'registration_reject',
    });
    await db().query('DELETE FROM registration_requests WHERE id = ?', [request.id]);
    res.json({ ok: true, deliveryStatus: delivery.status });
  } catch (error) {
    next(error);
  }
});

app.post('/api/registration-requests/:id/accept', requirePermission('registrationRequests'), async (req, res, next) => {
  const connection = await db().getConnection();
  let createdStudent;
  let requestForMessage;
  let committeeName;
  try {
    await connection.beginTransaction();
    const request = await getRegistrationRequestById(connection, req.params.id, { lock: true });
    if (!request) {
      await connection.rollback();
      return res.status(404).json({ message: 'طلب التسجيل غير موجود.' });
    }

    const name = String(req.body.name || request.name || '').replace(/\s+/g, ' ').trim();
    const loginNumber = normalizeAccountLoginNumber(req.body.loginNumber || request.nationalId || '');
    const guardianPhone = normalizeAccountPhone(req.body.guardianPhone ?? request.guardianPhone);
    const nationalId = normalizeOptionalNationalId(req.body.nationalId ?? request.nationalId);
    const age = Number(toDigitsOnly(req.body.age || request.age));
    const committeeId = normalizeOptionalCommitteeId(req.body.committeeId);
    if (!name || !loginNumber || !committeeId) {
      await connection.rollback();
      return res.status(422).json({ message: 'الاسم ورقم الدخول والحلقة مطلوبة.' });
    }
    if (!Number.isInteger(age) || age < 4 || age > 120) {
      await connection.rollback();
      return res.status(422).json({ message: 'العمر غير صحيح.' });
    }

    const [[committee]] = await connection.query('SELECT id, name FROM committees WHERE id = ? LIMIT 1', [committeeId]);
    if (!committee) {
      await connection.rollback();
      return res.status(422).json({ message: 'الحلقة المختارة غير موجودة.' });
    }
    committeeName = committee.name;
    await ensureLoginNumberIsAvailable(connection, loginNumber);
    await assertStudentIdentityAvailable(connection, nationalId);

    const items = Array.isArray(request.memorization.items) ? request.memorization.items : [];
    const testResults = items.length ? normalizeRegistrationTestResults(items, req.body.testResults || {}) : {};
    const acceptedRanges = items
      .filter((item) => testResults[item.id] === 'passed')
      .map(normalizeQuranRange);

    const [result] = await connection.query(
      `
      INSERT INTO students (name, login_number, national_id, guardian_phone, age, committee_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [name, loginNumber, nationalId, guardianPhone, age, committeeId]
    );

    await saveStandalonePriorMemorizationRanges(connection, result.insertId, acceptedRanges);
    await connection.query(
      'UPDATE registration_requests SET test_results_json = ? WHERE id = ?',
      [JSON.stringify(testResults), request.id]
    );
    await connection.query('DELETE FROM registration_requests WHERE id = ?', [request.id]);
    await connection.commit();

    createdStudent = {
      id: result.insertId,
      name,
      loginNumber,
      nationalId,
      guardianPhone,
      age,
      committeeId,
      committeeName,
    };
    requestForMessage = { ...request, ...createdStudent };
  } catch (error) {
    await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }

  try {
    const settings = await loadSettings();
    const delivery = await notifyRegistrationRequestPhone(requestForMessage, settings.registrationAcceptTemplate, {
      ...createdStudent,
      committeeName,
      messageType: 'registration_accept',
    });
    res.status(201).json({ ok: true, student: createdStudent, deliveryStatus: delivery.status });
  } catch (error) {
    next(error);
  }
});

app.get('/api/quran/chapters', requireQuranReferenceAccess, async (_req, res, next) => {
  try {
    res.json(await getQuranChaptersForClient(db()));
  } catch (error) {
    next(error);
  }
});

app.get('/api/quran/ayahs', requireQuranReferenceAccess, async (req, res, next) => {
  try {
    const surah = Number(req.query.surah || 0);
    if (!surah) return res.status(422).json({ message: 'السورة مطلوبة.' });
    const [rows] = await db().query(
      `
      SELECT ayah_number AS ayah, page_number AS page, juz_number AS juz
      FROM quran_ayah_pages
      WHERE surah_number = ?
      ORDER BY ayah_number ASC
      `,
      [surah]
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/quran/juz-ranges', requireStudentPlanAccess, async (_req, res, next) => {
  try {
    res.json(await getQuranJuzRangesForClient(db()));
  } catch (error) {
    next(error);
  }
});

app.get('/api/student-plans/preferences', requireStudentPlanAccess, async (req, res, next) => {
  try {
    const actorRole = String(req.auth?.role || 'manager');
    const actorId = Number(req.auth?.id || 0);
    const [[row]] = await db().query(
      `SELECT DATE_FORMAT(last_start_date, '%Y-%m-%d') AS lastStartDate
       FROM quran_plan_user_preferences
       WHERE actor_role = ? AND actor_id = ?
       LIMIT 1`,
      [actorRole, actorId],
    );
    res.json({ lastStartDate: row?.lastStartDate || '' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/student-plans', requireStudentPlanAccess, async (req, res, next) => {
  try {
    const committeeId = String(req.query.committeeId || 'all');
    const params = [];
    const filters = [];
    if (committeeId !== 'all') {
      filters.push('s.committee_id = ?');
      params.push(committeeId);
    }
    if (req.auth?.role === 'supervisor') {
      filters.push(`EXISTS (
        SELECT 1 FROM supervisor_committees sc
        WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id
      )`);
      params.push(req.auth.id);
    }

    const [rows] = await db().query(
      `
      SELECT
        s.id AS studentId,
        s.name AS studentName,
        c.name AS committeeName,
        p.id,
        p.previous_plan_id AS previousPlanId,
        p.status,
        p.track,
        p.start_surah AS startSurah,
        p.start_ayah AS startAyah,
        p.start_page AS startPage,
        p.end_surah AS endSurah,
        p.end_ayah AS endAyah,
        p.end_page AS endPage,
        p.daily_pages AS dailyPages,
        p.link_pages AS linkPages,
        p.review_pages AS reviewPages,
      p.review_hizbs AS reviewHizbs,
      p.reading_faces AS readingFaces,
        p.review_split_weekly AS reviewSplitWeekly,
        p.review_week_start_day AS reviewWeekStartDay,
        p.review_week_end_day AS reviewWeekEndDay,
        p.review_min_daily_pages AS reviewMinDailyPages,
        DATE_FORMAT(p.created_at, '%Y-%m-%d') AS createdDate,
        DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(p.target_end_date, '%Y-%m-%d') AS targetEndDate,
        DATE_FORMAT(p.effective_from, '%Y-%m-%d') AS effectiveFrom,
        p.schedule_days_json AS scheduleDays,
        p.schedule_anchor_page AS scheduleAnchorPage,
        p.schedule_anchor_surah AS scheduleAnchorSurah,
        p.schedule_anchor_ayah AS scheduleAnchorAyah,
        p.next_memorization_page AS nextMemorizationPage,
        p.next_memorization_surah AS nextMemorizationSurah,
        p.next_memorization_ayah AS nextMemorizationAyah,
        p.next_review_page AS nextReviewPage,
        COALESCE(cp.completedPages, 0) AS completedPages,
        COALESCE(pp.priorPages, 0) AS priorPages,
        COALESCE(schedule.dueFaces, 0) AS dueFaces,
        COALESCE(schedule.dueCompletedFaces, 0) AS dueCompletedFaces,
        qs.name_arabic AS startSurahName,
        qe.name_arabic AS endSurahName
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      LEFT JOIN student_quran_plans p ON p.student_id = s.id AND ${currentQuranPlanSql('p')}
      LEFT JOIN quran_surahs qs ON qs.surah_number = p.start_surah
      LEFT JOIN quran_surahs qe ON qe.surah_number = p.end_surah
      LEFT JOIN (
        SELECT plan_id, COUNT(DISTINCT from_page) AS completedPages
        FROM student_quran_tasks
        WHERE ${acceptedMemorizationSql()}
          AND from_page = to_page
          AND task_type = 'memorization'
        GROUP BY plan_id
      ) cp ON cp.plan_id = p.id
      LEFT JOIN (
        SELECT plan_id, SUM(end_page - start_page + 1) AS priorPages
        FROM student_quran_plan_prior_memorization
        GROUP BY plan_id
      ) pp ON pp.plan_id = p.id
      LEFT JOIN (
        SELECT schedule_t.plan_id AS planId,
          SUM(COALESCE(schedule_t.target_pages, GREATEST(0, schedule_t.to_page - schedule_t.from_page + 1))) AS dueFaces,
          SUM(CASE WHEN schedule_t.teacher_completed = 1 OR (schedule_t.teacher_completed IS NULL AND schedule_t.student_status = 'done' AND COALESCE(schedule_t.execution_state, '') IN ('complete', 'partial', 'extra')) THEN GREATEST(0, COALESCE(schedule_t.actual_to_page, schedule_t.to_page) - schedule_t.from_page + 1) ELSE 0 END) AS dueCompletedFaces
        FROM student_quran_tasks schedule_t
        JOIN student_quran_plans schedule_p ON schedule_p.id = schedule_t.plan_id
        WHERE schedule_t.task_type = 'memorization'
          AND schedule_t.task_date <= CURDATE()
          AND schedule_t.task_date >= COALESCE(schedule_p.start_date, DATE(schedule_p.created_at))
        GROUP BY schedule_t.plan_id
      ) schedule ON schedule.planId = p.id
      ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}
      ORDER BY c.name ASC, s.name ASC
      `,
      params
    );
    const planIds = rows.map((row) => row.id).filter(Boolean);
    const priorByPlan = new Map();
    const completedByPlan = new Map();
    if (planIds.length > 0) {
      const [priorRows] = await db().query(
        `
        SELECT
          plan_id AS planId,
          start_surah AS startSurah,
          start_ayah AS startAyah,
          start_page AS startPage,
          end_surah AS endSurah,
          end_ayah AS endAyah,
          end_page AS endPage
        FROM student_quran_plan_prior_memorization
        WHERE plan_id IN (${planIds.map(() => '?').join(',')})
        ORDER BY start_page ASC, end_page ASC
        `,
        planIds
      );
      priorRows.forEach((prior) => {
        const key = String(prior.planId);
        if (!priorByPlan.has(key)) priorByPlan.set(key, []);
        priorByPlan.get(key).push(prior);
      });
      const [completedRows] = await db().query(
        `
        SELECT
          plan_id AS planId,
          from_surah AS startSurah,
          from_ayah AS startAyah,
          from_page AS startPage,
          COALESCE(actual_to_surah, to_surah) AS endSurah,
          COALESCE(actual_to_ayah, to_ayah) AS endAyah,
          COALESCE(actual_to_page, to_page) AS endPage
        FROM student_quran_tasks
        WHERE plan_id IN (${planIds.map(() => '?').join(',')})
          AND task_type = 'memorization'
          AND ${acceptedMemorizationSql()}
          AND from_surah IS NOT NULL
          AND from_ayah IS NOT NULL
          AND to_surah IS NOT NULL
          AND to_ayah IS NOT NULL
        ORDER BY from_page ASC, to_page ASC
        `,
        planIds
      );
      completedRows.forEach((completed) => {
        const key = String(completed.planId);
        if (!completedByPlan.has(key)) completedByPlan.set(key, []);
        completedByPlan.get(key).push(completed);
      });
    }
    const planSettings = await loadSettings();
    const normalizedRows = await Promise.all(rows.map(async (row) => {
      let plan = null;
      if (row.id) {
        const priorMemorization = priorByPlan.get(String(row.id)) || [];
        const completedMemorization = (await Promise.all(
          (completedByPlan.get(String(row.id)) || []).map((range) => expandQuranTraversalRange(db(), range))
        )).flat();
        const planStart = { page: Number(row.startPage), surah: Number(row.startSurah), ayah: Number(row.startAyah) };
        const planEnd = { page: Number(row.endPage), surah: Number(row.endSurah), ayah: Number(row.endAyah) };
        const { totalAyahs, memorizedAyahs } = await countMemorizedAyahsInRange(db(), completedMemorization, planStart, planEnd);
        const completedPagesExact = (await getFullyMemorizedPages(db(), completedMemorization, Number(row.startPage), Number(row.endPage))).size;
        const normalizedPlan = normalizePlanRow({
          ...row,
          totalAyahs,
          completedAyahs: memorizedAyahs,
          completedPagesExact,
          priorMemorization,
          completedMemorization,
        });
        const progressContext = await getPlanProgressContext(
          db(),
          normalizedPlan,
          addUtcDays(getSaudiDateTimeParts().date, -1),
          planSettings,
        );
        plan = { ...normalizedPlan, progress: await getPlanProgressSummary(db(), progressContext) };
      }
      return {
        studentId: row.studentId,
        studentName: row.studentName,
        committeeName: row.committeeName,
        priorMemorization: await getPriorMemorizationRangesForStudent(db(), row.studentId),
        plan,
      };
    }));
    res.json(normalizedRows);
  } catch (error) {
    next(error);
  }
});

app.put('/api/student-plans/:studentId', requireStudentPlanAccess, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const planSettings = await loadSettings();
    const studentId = Number(req.params.studentId || 0);
    let startSurah = Number(req.body.startSurah || 0);
    let startAyah = Number(req.body.startAyah || 0);
    let endSurah = Number(req.body.endSurah || 0);
    let endAyah = Number(req.body.endAyah || 0);
    const requestedStartPage = Number(req.body.startPage || 0);
    const requestedEndPage = Number(req.body.endPage || 0);
    const dailyPages = toPositiveQuarterFace(req.body.dailyPages, 1);
    const linkPages = toPositiveInt(req.body.linkPages, 10);
    const reviewPages = toPositiveInt(req.body.reviewPages, 20);
    const reviewHizbs = Math.min(60, toPositiveInt(req.body.reviewHizbs, 1));
    const requestedReadingFaces = Math.floor(Number(req.body.readingFaces) || 0);
    const readingFaces = requestedReadingFaces > 0 ? Math.min(MAX_PLAN_READING_FACES, requestedReadingFaces) : DEFAULT_PLAN_READING_FACES;
    const planSaveMode = req.body.mode === PLAN_SAVE_MODES.new ? PLAN_SAVE_MODES.new : PLAN_SAVE_MODES.continue;
    if (req.body.track && req.body.track !== 'memorization') return res.status(422).json({ message: 'مسار الخطة غير متاح.' });
    const track = 'memorization';
    const reviewSplitWeekly = req.body.reviewSplitWeekly === true || req.body.reviewSplitWeekly === 1 ? 1 : 0;
    const reviewWeekStartDay = normalizeWeekDay(req.body.reviewWeekStartDay, 0);
    const reviewWeekEndDay = normalizeWeekDay(req.body.reviewWeekEndDay, 6);
    const reviewMinDailyPages = toPositiveInt(req.body.reviewMinDailyPages, 1);
    const todayDate = getSaudiDateTimeParts().date;
    const minimumPlanStartDate = isValidDateOnly(planSettings.currentTermStartDate)
      && planSettings.currentTermStartDate > todayDate
      ? planSettings.currentTermStartDate
      : todayDate;
    const requestedStartDate = String(req.body.startDate || '').trim() || minimumPlanStartDate;
    const rejectInvalidPlanInputsResult = await rejectInvalidPlanInputs({ requestedStartDate, reviewSplitWeekly, reviewWeekStartDay, reviewWeekEndDay, planSettings, studentId, requestedStartPage, requestedEndPage, startSurah, startAyah, endSurah, endAyah, res });
    if (rejectInvalidPlanInputsResult) { return rejectInvalidPlanInputsResult; }
    await connection.beginTransaction();
    const [[student]] = await connection.query('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
    const rejectUneditableStudentPlanResult = await rejectUneditableStudentPlan({ student, connection, res, req, studentId });
    if (rejectUneditableStudentPlanResult) { return rejectUneditableStudentPlanResult; }
    const { requestedStartBoundary, requestedEndBoundary } = await resolveRequestedPlanPageBounds(requestedStartPage, requestedEndPage, connection);
    const rejectMissingPlanPageBoundaryResult = await rejectMissingPlanPageBoundary({ requestedStartPage, requestedStartBoundary, requestedEndPage, requestedEndBoundary, connection, res });
    if (rejectMissingPlanPageBoundaryResult) { return rejectMissingPlanPageBoundaryResult; }

    let start;
    let end;
    ({ start, end, startSurah, startAyah, endSurah, endAyah } = await resolvePlanPositions({ requestedStartBoundary, startSurah, startAyah, requestedEndBoundary, endSurah, endAyah, connection }));
    if (!start || !end) {
      await connection.rollback();
      return res.status(422).json({ message: 'السورة أو الآية غير صحيحة.' });
    }
    const direction = getQuranRangeDirection(start, end);
    const submittedPriorMemorization = await normalizePriorMemorizationRanges(connection, req.body.priorMemorization);
    const [[existingPlan]] = await connection.query(
      `
      SELECT
        id,
        student_id AS studentId,
        status,
        plan_version AS planVersion,
        EXISTS (SELECT 1 FROM student_quran_tasks done_task WHERE done_task.plan_id = student_quran_plans.id
          AND (done_task.teacher_completed IS NOT NULL OR done_task.student_status = 'done'
            OR EXISTS (SELECT 1 FROM student_quran_recitation_attempts attempt WHERE attempt.task_id = done_task.id AND attempt.is_official = 1))) AS hasExecutedTasks,
        track,
        start_surah AS startSurah,
        start_ayah AS startAyah,
        start_page AS startPage,
        end_surah AS endSurah,
        end_ayah AS endAyah,
        end_page AS endPage,
        daily_pages AS dailyPages,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(effective_from, '%Y-%m-%d') AS effectiveFrom,
        schedule_days_json AS scheduleDays,
        schedule_anchor_page AS scheduleAnchorPage,
        schedule_anchor_surah AS scheduleAnchorSurah,
        schedule_anchor_ayah AS scheduleAnchorAyah,
        next_memorization_page AS nextMemorizationPage,
        next_memorization_surah AS nextMemorizationSurah,
        next_memorization_ayah AS nextMemorizationAyah,
        next_review_page AS nextReviewPage
      FROM student_quran_plans
      WHERE student_id = ? AND status IN ('active', 'completed')
      ORDER BY id DESC LIMIT 1
      FOR UPDATE
      `,
      [studentId]
    );
    // "continue" keeps the running plan (start date, schedule and review cursor) with new amounts;
    // "new" keeps the current plan as history and starts a fresh one from the requested date.
    const continuedPlan = planSaveMode === PLAN_SAVE_MODES.continue ? existingPlan : null;
    // A plan that has not started yet may move its start date (never into the past).
    const notStartedPlan = Boolean(continuedPlan && !Number(continuedPlan.hasExecutedTasks) && String(continuedPlan.startDate || '') >= todayDate && req.body.startDate);
    const startDate = notStartedPlan ? requestedStartDate : continuedPlan?.startDate || requestedStartDate;
    const effectiveFrom = continuedPlan && !notStartedPlan ? minimumPlanStartDate : startDate;
    const rejectPastNewPlanStartResult = await rejectPastNewPlanStart({ existingPlan: notStartedPlan ? null : continuedPlan, startDate, minimumPlanStartDate, connection, res });
    if (rejectPastNewPlanStartResult) { return rejectPastNewPlanStartResult; }

    const existingPriorMemorization = await getPriorMemorizationRangesForStudent(connection, studentId);
    const completedMemorization = await getCompletedMemorizationRanges(connection, { studentId, approvedOnly: true });
    const priorMemorization = await mergeQuranRanges(connection, [
      ...existingPriorMemorization,
      ...completedMemorization,
      ...submittedPriorMemorization,
    ]);
    const memorizedPlanAyahs = await countMemorizedAyahsInRange(connection, priorMemorization, start, end);
    const rejectFullyMemorizedPlanResult = await rejectFullyMemorizedPlan({ memorizedPlanAyahs, connection, res });
    if (rejectFullyMemorizedPlanResult) { return rejectFullyMemorizedPlanResult; }

    if (continuedPlan) {
      const changeDate = notStartedPlan ? startDate : addUtcDays(todayDate, 1);
      const previousProgress = notStartedPlan ? null : await getPlanProgressContext(connection, continuedPlan, todayDate, planSettings);
      const anchor = previousProgress?.scheduledEnd || (continuedPlan.scheduleAnchorPage ? {
        page: continuedPlan.scheduleAnchorPage, surah: continuedPlan.scheduleAnchorSurah, ayah: continuedPlan.scheduleAnchorAyah,
      } : null);
      await updateContinuedQuranPlan(connection, {
        plan: continuedPlan, effectiveFrom: changeDate, scheduleDays: getMemorizationScheduleDays(planSettings), scheduleAnchor: anchor,
        values: { startDate, start, end, track, dailyPages, linkPages, reviewPages, reviewHizbs, readingFaces,
          reviewSplitWeekly, reviewWeekStartDay, reviewWeekEndDay, reviewMinDailyPages },
      });
      for (const range of submittedPriorMemorization) {
        const coverage = await countMemorizedAyahsInRange(connection, [...existingPriorMemorization, ...completedMemorization], getQuranRangeStart(range), getQuranRangeEnd(range));
        if (coverage.memorizedAyahs < coverage.totalAyahs) await savePriorMemorizationRange(connection, continuedPlan.id, studentId, range);
      }
      const savedPlan = await getActivePlanForStudent(connection, studentId);
      await recomputePlanMemorizationCursor(connection, savedPlan);
      if (startDate <= todayDate) await ensureStudentPlanTasks(connection, savedPlan, todayDate, planSettings);
      await connection.commit();
      return res.json({ ok: true, id: continuedPlan.id });
    }

    const fullyMemorizedPages = await getFullyMemorizedPages(connection, priorMemorization, 1, 604);
    const nextMemorizationStart = await skipFullyMemorizedTraversalPages(
      connection,
      start,
      end,
      direction,
      fullyMemorizedPages
    );
    const nextMemorizationPage = nextMemorizationStart?.page || 0;
    let { scheduleDays, scheduleAnchor } = await resolveReplacementPlanAnchor({ existingPlan: continuedPlan, startSurah, startAyah, startDate, effectiveFrom, connection, planSettings });

    const nextReviewPage = continuedPlan
      ? await resolveContinuedReviewCursor(connection, continuedPlan, minimumPlanStartDate) || start.page
      : start.page;
    if (existingPlan?.id) {
      await connection.query(
        `DELETE t FROM student_quran_tasks t
         WHERE t.plan_id = ?
           AND t.task_date >= ?
           AND t.teacher_completed IS NULL
           AND COALESCE(t.student_status, 'not_done') <> 'done'
           AND NOT EXISTS (
             SELECT 1 FROM student_quran_recitation_attempts attempt
             WHERE attempt.task_id = t.id AND attempt.is_official = 1
           )`,
        [existingPlan.id, minimumPlanStartDate],
      );
    }
    await connection.query(
      "UPDATE student_quran_plans SET status = 'paused' WHERE student_id = ? AND status IN ('active', 'completed')",
      [studentId]
    );
    const [result] = await connection.query(
      `
      INSERT INTO student_quran_plans
        (student_id, previous_plan_id, status, plan_version, start_date, target_end_date, effective_from, schedule_days_json, schedule_anchor_page, schedule_anchor_surah, schedule_anchor_ayah, track, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page, daily_pages, link_pages, review_pages, review_hizbs, reading_faces, review_split_weekly, review_week_start_day, review_week_end_day, review_min_daily_pages, next_memorization_page, next_memorization_surah, next_memorization_ayah, next_review_page)
      VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        studentId,
        continuedPlan?.id || null,
        Number(existingPlan?.planVersion || 0) + 1,
        startDate,
        null,
        effectiveFrom,
        JSON.stringify(scheduleDays),
        scheduleAnchor?.page || null,
        scheduleAnchor?.surah || null,
        scheduleAnchor?.ayah || null,
        track,
        startSurah,
        startAyah,
        start.page,
        endSurah,
        endAyah,
        end.page,
        dailyPages,
        linkPages,
        reviewPages,
        reviewHizbs,
        readingFaces,
        reviewSplitWeekly,
        reviewWeekStartDay,
        reviewWeekEndDay,
        reviewMinDailyPages,
        nextMemorizationPage,
        nextMemorizationStart?.surah || null,
        nextMemorizationStart?.ayah || null,
        nextReviewPage,
      ]
    );

    await savePriorMemorizationRanges(connection, result.insertId, studentId, priorMemorization);
    if (startDate <= todayDate) {
      const savedPlan = await getActivePlanForStudent(connection, studentId);
      await ensureStudentPlanTasks(connection, savedPlan, todayDate, planSettings);
    }
    await saveInitialPlanDatePreference(continuedPlan, startDate, connection, req);
    await connection.commit();
    res.json({
      ok: true,
      id: result.insertId,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.delete('/api/student-plans/:studentId', requireStudentPlanAccess, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const studentId = Number(req.params.studentId || 0);
    if (!studentId) return res.status(422).json({ message: 'الطالب غير صحيح.' });
    if (req.auth?.role === 'supervisor' && !await hasSupervisorStudentPlanAccess(req, studentId)) {
      return res.status(403).json({ message: 'لا يمكنك حذف خطة طالب خارج حلقاتك.' });
    }
    await connection.beginTransaction();
    const [[plan]] = await connection.query(
      "SELECT id FROM student_quran_plans WHERE student_id = ? AND status IN ('active', 'completed') ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [studentId],
    );
    if (!plan) {
      await connection.rollback();
      return res.status(404).json({ message: 'لا توجد خطة حالية للطالب.' });
    }
    await connection.query("UPDATE student_quran_plans SET status = 'paused' WHERE id = ?", [plan.id]);
    await connection.query(
      `DELETE task FROM student_quran_tasks task
       WHERE task.plan_id = ?
         AND task.teacher_completed IS NULL
         AND COALESCE(task.student_status, 'not_done') <> 'done'
         AND NOT EXISTS (
           SELECT 1 FROM student_quran_recitation_attempts attempt
           WHERE attempt.task_id = task.id AND attempt.is_official = 1
         )`,
      [plan.id],
    );
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.delete('/api/student-plans/:studentId/prior-memorization', requireStudentPlanAccess, async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const studentId = Number(req.params.studentId || 0);
    const fromPage = Number(req.body.fromPage || 0);
    const toPage = Number(req.body.toPage || 0);
    if (!studentId || !isValidQuranPageNumber(fromPage) || !isValidQuranPageNumber(toPage) || fromPage > toPage) {
      return res.status(422).json({ message: 'نطاق المحفوظ غير صحيح.' });
    }
    await connection.beginTransaction();
    if (req.auth?.role === 'supervisor' && !await hasSupervisorStudentPlanAccess(req, studentId)) {
      await connection.rollback();
      return res.status(403).json({ message: 'لا يمكنك تعديل محفوظ طالب خارج حلقاتك.' });
    }
    await removePriorMemorizationPageRange(connection, studentId, fromPage, toPage);
    const remainingRanges = await getPriorMemorizationRangesForStudent(connection, studentId);
    await connection.commit();
    res.json({ ok: true, priorMemorization: remainingRanges });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/families', async (req, res, next) => {
  try {
    const params = [];
    const where = req.query.search ? 'WHERE c.name LIKE ?' : '';
    if (req.query.search) params.push(`%${req.query.search}%`);

    const [rows] = await db().query(
      `
      SELECT
        c.id,
        c.name,
        c.points,
        COALESCE(sc.studentsCount, 0) AS studentsCount
      FROM committees c
      LEFT JOIN (
        SELECT committee_id, COUNT(*) AS studentsCount
        FROM students
        WHERE committee_id IS NOT NULL
        GROUP BY committee_id
      ) sc ON sc.committee_id = c.id
      ${where}
      ORDER BY c.name ASC
      `,
      params
    );

    res.json(rows.map((row) => ({
      ...row,
      points: Number(row.points || 0),
      studentsCount: Number(row.studentsCount || 0),
    })));
  } catch (error) {
    next(error);
  }
});

app.post('/api/families', requirePermission('families'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(422).json({ message: 'اسم الحلقة مطلوب.' });
    }

    await connection.beginTransaction();
    await assertCommitteeNameAvailable(connection, name);
    const [result] = await connection.query(
      `
      INSERT INTO committees (name)
      VALUES (?)
      `,
      [name]
    );

    await connection.commit();
    res.status(201).json({
      id: result.insertId,
      name,
      points: 0,
      studentsCount: 0,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

app.put('/api/families/:id', requirePermission('families'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(422).json({ message: 'اسم الحلقة مطلوب.' });
    }

    await connection.beginTransaction();
    await assertCommitteeNameAvailable(connection, name, req.params.id);
    const [[current]] = await connection.query(
      'SELECT points FROM committees WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!current) {
      await connection.rollback();
      return res.status(404).json({ message: 'الحلقة غير موجودة.' });
    }

    await connection.query('UPDATE committees SET name = ? WHERE id = ?', [name, req.params.id]);
    await connection.commit();

    res.json({ ok: true, pointDelta: 0, affectedStudents: 0 });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.delete('/api/families/:id', requirePermission('families'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const [[studentCount]] = await connection.query(
      'SELECT COUNT(*) AS count FROM students WHERE committee_id = ?',
      [req.params.id]
    );
    await connection.query('UPDATE students SET committee_id = NULL WHERE committee_id = ?', [req.params.id]);
    await connection.query('UPDATE narration_events SET committee_id = NULL WHERE committee_id = ?', [req.params.id]);
    await connection.query('DELETE FROM call_rooms WHERE committee_id = ?', [req.params.id]);
    const [result] = await connection.query('DELETE FROM committees WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'الحلقة غير موجودة.' });
    }
    await connection.commit();
    res.json({ ok: true, detachedStudents: Number(studentCount.count || 0) });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/families/:id/students', async (req, res, next) => {
  try {
    const [rows] = await db().query(
      `
      SELECT
        id,
        name,
        guardian_phone AS guardianPhone
      FROM students
      WHERE committee_id = ?
      ORDER BY name ASC
      `,
      [req.params.id]
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

app.get('/api/rankings/students', async (req, res, next) => {
  try {
    const settings = await loadSettings();
    if (!settings.studentRankingsVisible) {
      return res.status(404).json({ message: 'ترتيب الطلاب غير مفعّل حالياً.' });
    }
    const committeeId = String(req.query.committeeId || 'all');
    const filters = [];
    const params = [];
    if (committeeId !== 'all') {
      filters.push('s.committee_id = ?');
      params.push(committeeId);
    }

    const [rows] = await db().query(
      `
      SELECT ranked.* FROM (SELECT
        s.id,
        s.name,
        s.points,
        s.committee_id AS committeeId,
        c.name AS committeeName,
        RANK() OVER (ORDER BY s.points DESC) AS rank,
        ROW_NUMBER() OVER (ORDER BY s.points DESC, s.name ASC, s.id ASC) AS position
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}
      ) ranked WHERE position <= 8 OR id = ?
      ORDER BY position
      `,
      [...params, req.auth?.role === 'student' ? Number(req.auth.id) : 0]
    );

    res.json(rows.map(({ position: _position, ...row }) => ({
      ...row,
      rank: Number(row.rank),
      points: Number(row.points || 0),
      committeeId: row.committeeId ? Number(row.committeeId) : null,
    })));
  } catch (error) {
    next(error);
  }
});

app.get('/api/rankings/families', async (_req, res, next) => {
  try {
    const settings = await loadSettings();
    if (!settings.familyRankingsVisible) {
      return res.status(404).json({ message: 'ترتيب الحلقات غير مفعّل حالياً.' });
    }
    const [rows] = await db().query(
      `SELECT c.id, c.name, c.points,
        COALESCE(ROUND(AVG(GREATEST(0, COALESCE(s.points, 0)))), 0) AS averagePoints,
        COUNT(s.id) AS studentsCount
       FROM committees c
       LEFT JOIN students s ON s.committee_id = c.id
       GROUP BY c.id, c.name, c.points
       ORDER BY averagePoints DESC, studentsCount DESC, c.name ASC`,
    );
    res.json(rankFamilies(rows, settings.familyRankingMode).slice(0, 8));
  } catch (error) {
    next(error);
  }
});

app.get('/api/supervisors', async (req, res, next) => {
  try {
    const params = [];
    const filters = ["role = 'supervisor'"];
    if (req.query.search) params.push(`%${req.query.search}%`);
    if (req.query.search) filters.push('name LIKE ?');

    const [rows] = await db().query(
      `
      SELECT
        id,
        name,
        login_number AS loginNumber,
        national_id AS nationalId,
        phone,
        job_title AS jobTitle,
        role
      FROM supervisors
      WHERE ${filters.join(' AND ')}
      ORDER BY created_at DESC
      `,
      params
    );

    const [links] = await db().query('SELECT supervisor_id AS supervisorId, committee_id AS committeeId FROM supervisor_committees');
    const committeeMap = new Map();
    for (const link of links) {
      const key = String(link.supervisorId);
      if (!committeeMap.has(key)) committeeMap.set(key, []);
      committeeMap.get(key).push(String(link.committeeId));
    }

    res.json(rows.map((row) => ({
      ...row,
      committeeIds: committeeMap.get(String(row.id)) || [],
    })));
  } catch (error) {
    next(error);
  }
});

app.post('/api/supervisors', requirePermission('supervisors'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const name = normalizeAccountName(req.body.name, 'اسم المعلم');
    const loginNumber = normalizeAccountLoginNumber(req.body.loginNumber);
    const cleanNationalId = normalizeOptionalNationalId(req.body.nationalId);
    const phone = normalizeAccountPhone(req.body.phone);
    const jobTitle = 'معلم';
    const committeeIds = await ensureCommitteeIdsExist(connection, req.body.committeeIds, { required: false });

    await connection.beginTransaction();
    await ensureLoginNumberIsAvailable(connection, loginNumber);
    const [result] = await connection.query(
      `
      INSERT INTO supervisors (name, login_number, national_id, phone, job_title, role)
      VALUES (?, ?, ?, ?, ?, 'supervisor')
      `,
      [name, loginNumber, cleanNationalId, phone, jobTitle]
    );
    if (committeeIds.length > 0) {
      await connection.query(
        'INSERT IGNORE INTO supervisor_committees (supervisor_id, committee_id) VALUES ?',
        [committeeIds.map((committeeId) => [result.insertId, committeeId])]
      );
    }
    await connection.commit();

    res.status(201).json({
      id: result.insertId,
      name,
      loginNumber,
      nationalId: cleanNationalId,
      phone,
      jobTitle,
      role: 'supervisor',
      committeeIds: committeeIds.map(String),
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.put('/api/supervisors/:id', requirePermission('supervisors'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const name = normalizeAccountName(req.body.name, 'اسم المعلم');
    const jobTitle = 'معلم';
    const cleanLoginNumber = normalizeAccountLoginNumber(req.body.loginNumber);
    const cleanNationalId = normalizeOptionalNationalId(req.body.nationalId);
    const phone = normalizeAccountPhone(req.body.phone);
    const committeeIds = await ensureCommitteeIdsExist(connection, req.body.committeeIds, { required: false });

    await connection.beginTransaction();
    const [[currentSupervisor]] = await connection.query(
      "SELECT id, login_number AS loginNumber FROM supervisors WHERE id = ? AND role = 'supervisor' FOR UPDATE",
      [req.params.id]
    );
    if (!currentSupervisor) {
      await connection.rollback();
      return res.status(404).json({ message: 'المعلم غير موجود.' });
    }
    await ensureLoginNumberIsAvailable(connection, cleanLoginNumber, { type: 'supervisor', id: req.params.id });
    await connection.query(
      `
      UPDATE supervisors
      SET name = ?, login_number = ?, national_id = ?, phone = ?, job_title = ?
      WHERE id = ? AND role = 'supervisor'
      `,
      [name, cleanLoginNumber, cleanNationalId, phone, jobTitle, req.params.id]
    );
    await connection.query('DELETE FROM supervisor_committees WHERE supervisor_id = ?', [req.params.id]);
    if (committeeIds.length > 0) {
      await connection.query(
        'INSERT IGNORE INTO supervisor_committees (supervisor_id, committee_id) VALUES ?',
        [committeeIds.map((committeeId) => [req.params.id, committeeId])]
      );
    }
    if (String(currentSupervisor.loginNumber || '').trim() !== cleanLoginNumber) {
      await revokeAuthSessionsForUser(connection, 'supervisor', req.params.id);
    }
    await connection.commit();

    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.delete('/api/supervisors/:id', requirePermission('supervisors'), async (req, res, next) => {
  try {
    const [[supervisor]] = await db().query('SELECT id, role FROM supervisors WHERE id = ? LIMIT 1', [req.params.id]);
    if (!supervisor) {
      return res.status(404).json({ message: 'المعلم غير موجود.' });
    }
    if (supervisor.role !== 'supervisor') {
      return res.status(409).json({ message: 'هذا الحساب ليس معلماً.' });
    }

    const [[history]] = await db().query(
      `
      SELECT
        (SELECT COUNT(*) FROM supervisor_student_point_awards WHERE supervisor_id = ?) +
        (SELECT COUNT(*) FROM supervisor_family_point_awards WHERE supervisor_id = ?) AS count
      `,
      [req.params.id, req.params.id]
    );
    if (Number(history.count || 0) > 0) {
      return res.status(409).json({ message: 'لا يمكن حذف معلم لديه سجل نقاط. عدل بياناته بدلًا من الحذف.' });
    }
    await db().query('DELETE FROM supervisors WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/students/:id/quran-today', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const studentId = Number(req.params.id || 0);
    if (!await canReadStudentQuranToday(req, studentId)) {
      return res.status(403).json({ message: 'ليست لديك صلاحية لعرض تنفيذ هذا الطالب.' });
    }
    const date = getSaudiDateTimeParts().date;
    const settings = await loadSettings();
    const plan = await getActivePlanForStudent(connection, studentId);
    if (!plan) return res.json(studentVisibleToday({ plan: null, tasks: [], isHoliday: isWeeklyHoliday(date, settings), date }, settings, req.auth?.role));
    const completedRanges = await getCompletedMemorizationRanges(connection, { studentId, planId: plan.id });
    const { totalAyahs, memorizedAyahs } = await countMemorizedAyahsInRange(connection, completedRanges,
      { page: plan.startPage, surah: plan.startSurah, ayah: plan.startAyah },
      { page: plan.endPage, surah: plan.endSurah, ayah: plan.endAyah });
    plan.progressPercent = totalAyahs > 0 ? Math.round(memorizedAyahs / totalAyahs * 100) : plan.progressPercent;
    await markExpiredPendingQuranTasks(connection, date);
    await ensureStudentPlanTasks(connection, plan, date, settings);
    await ensureRepeatTasksForMemorizationDate(connection, plan, date);
    const [rows] = await connection.query(
      `
      SELECT
        t.id,
        t.plan_id AS planId,
        t.student_id AS studentId,
        s.name AS studentName,
        c.name AS committeeName,
        DATE_FORMAT(COALESCE(t.evaluated_at, t.task_date), '%Y-%m-%d') AS sessionDate,
        DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
        t.task_type AS taskType,
        t.track AS track,
        t.from_page AS fromPage,
        t.to_page AS toPage,
        t.from_surah AS fromSurah,
        t.from_ayah AS fromAyah,
        t.to_surah AS toSurah,
        t.to_ayah AS toAyah,
        qsf.name_arabic AS fromSurahName,
        qst.name_arabic AS toSurahName,
        t.target_pages AS targetPages,
        t.review_execution_json AS reviewExecution,
        t.normal_to_page AS normalToPage,
        t.normal_to_surah AS normalToSurah,
        t.normal_to_ayah AS normalToAyah,
        t.scheduled_to_page AS scheduledToPage,
        t.scheduled_to_surah AS scheduledToSurah,
        t.scheduled_to_ayah AS scheduledToAyah,
        t.actual_to_page AS actualToPage,
        t.actual_to_surah AS actualToSurah,
        t.actual_to_ayah AS actualToAyah,
        t.execution_state AS executionState,
        t.execution_actor_role AS executionActorRole,
        t.actual_repeat_count AS actualRepeatCount,
        t.actual_listening_count AS actualListeningCount,
        t.student_status AS studentStatus,
        t.teacher_rating_key AS teacherRatingKey,
        t.teacher_rating_label AS teacherRatingLabel,
        t.warning_count AS warningCount,
        t.mistake_count AS mistakeCount,
        t.evaluation_score AS evaluationScore,
        t.points,
        t.teacher_completed AS teacherCompleted
      FROM student_quran_tasks t
      JOIN students s ON s.id = t.student_id
      LEFT JOIN committees c ON c.id = s.committee_id
      LEFT JOIN quran_surahs qsf ON qsf.surah_number = t.from_surah
      LEFT JOIN quran_surahs qst ON qst.surah_number = t.to_surah
      WHERE t.student_id = ? AND t.task_date = ? AND t.plan_id = ?
        AND t.task_type IN ('memorization', 'repeat', 'review', 'link')
      ORDER BY FIELD(t.task_type, 'memorization', 'repeat', 'review', 'link'), t.from_page ASC
      `,
      [studentId, date, plan.id]
    );
    const memorizationRow = rows.find((row) => row.taskType === 'memorization');
    const memorizationContext = memorizationRow
      ? await getPlanProgressContext(connection, plan, date, settings, {
        page: Number(memorizationRow.fromPage),
        surah: Number(memorizationRow.fromSurah),
        ayah: Number(memorizationRow.fromAyah),
      })
      : null;
    const executionAyahMap = new Map();
    const executionAyahsByType = {};
    await buildTodayExecutionAyahs({ rows, memorizationContext, plan, connection, executionAyahMap, executionAyahsByType, date });
    const reviewCycle = await getStudentReviewCycle(connection, plan, date, rows.filter(row => row.taskType === 'review'));
    const executionAyahs = [...executionAyahMap.values()];
    const progress = await getPlanProgressSummary(connection, memorizationContext);
    const normalizedTasks = rows.map((row) => normalizeTaskRow(row, settings.quranReferenceMode));

    const repeatCount = normalizeQuranPlanTrack(plan.track) === 'mastery' ? settings.masteryRepeatCount : settings.memorizationRepeatCount;
    const listeningCount = normalizeRepeatCount(normalizeQuranPlanTrack(plan.track) === 'mastery' ? settings.masteryListeningCount : settings.memorizationListeningCount, 3);
    const executionSources = Object.fromEntries(['memorization', 'review', 'link', 'repeat'].map(type => [type, getQuranTaskExecutionSource(settings, type)]));
    const nextDay = await getStudentNextDayPreview({ date, tasks: normalizedTasks, repeatCount, listeningCount, executionSources },
      (tomorrow) => previewStudentPlanDay(connection, plan, tomorrow, settings));
    if (nextDay) nextDay.tasks = nextDay.tasks.map((task) => ({ ...task, repeatCount, listeningCount }));
    res.json(studentVisibleToday({
      nextDay,
      plan: { ...plan, progress },
      todayAmounts: normalizedTasks.filter((task) => task.taskType !== 'repeat'),
      tasks: normalizedTasks
        .filter((row) => req.auth?.role !== 'student'
          || canStudentExecuteQuranTask(settings, row.taskType)),
      repeatCount: normalizeQuranPlanTrack(plan.track) === 'mastery'
        ? settings.masteryRepeatCount
        : settings.memorizationRepeatCount,
      allowRepeatCountEditing: settings.allowRepeatCountEditing
        && canStudentExecuteQuranTask(settings, 'memorization'),
      listeningEnabled: true,
      listeningCount: normalizeRepeatCount(
        normalizeQuranPlanTrack(plan.track) === 'mastery'
          ? settings.masteryListeningCount
          : settings.memorizationListeningCount,
        3,
      ),
      allowListeningCountEditing: settings.allowListeningCountEditing
        && canStudentExecuteQuranTask(settings, 'memorization'),
      studentTaskAmountEditable: Boolean(settings.studentTaskAmountEditable),
      studentReviewAmountEditable: Boolean(settings.studentReviewAmountEditable),
      studentLinkAmountEditable: Boolean(settings.studentLinkAmountEditable),
      executionSources: {
        memorization: getQuranTaskExecutionSource(settings, 'memorization'),
        review: getQuranTaskExecutionSource(settings, 'review'),
        link: getQuranTaskExecutionSource(settings, 'link'),
        repeat: getQuranTaskExecutionSource(settings, 'repeat'),
      },
      allowQuranCompensation: Boolean(settings.allowQuranCompensation),
      allowQuranExtra: Boolean(settings.allowQuranExtra),
      executionAyahs,
      executionAyahsByType,
      reviewCycle,
      executionLimits: {
        memorization: memorizationContext?.allowedEnd || null,
      },
      isHoliday: isWeeklyHoliday(date, settings) && rows.length === 0,
      holidayTaskTypes: settings.holidayTaskTypes,
      date,
    }, settings, req.auth?.role));
  } catch (error) {
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/students/:id/quran-sessions', async (req, res, next) => {
  try {
    const studentId = Number(req.params.id || 0);
    if (!await canReadStudentQuranToday(req, studentId)) {
      return res.status(403).json({ message: 'ليست لديك صلاحية لعرض جلسات هذا الطالب.' });
    }

    const settings = await loadSettings();
    const planView = req.query.view === 'plan';
    const today = getSaudiDateTimeParts().date;
    const [rows] = await db().query(
      `
      SELECT
        t.id,
        t.plan_id AS planId,
        t.student_id AS studentId,
        s.name AS studentName,
        c.name AS committeeName,
        DATE_FORMAT(COALESCE(t.evaluated_at, t.task_date), '%Y-%m-%d') AS sessionDate,
        DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
        t.task_type AS taskType,
        t.track AS track,
        t.compensation_index AS compensationIndex,
        t.from_page AS fromPage,
        t.to_page AS toPage,
        t.from_surah AS fromSurah,
        t.from_ayah AS fromAyah,
        t.to_surah AS toSurah,
        t.to_ayah AS toAyah,
        qsf.name_arabic AS fromSurahName,
        qst.name_arabic AS toSurahName,
        t.target_pages AS targetPages,
        t.review_execution_json AS reviewExecution,
        t.actual_to_page AS actualToPage,
        t.actual_to_surah AS actualToSurah,
        t.actual_to_ayah AS actualToAyah,
        t.execution_state AS executionState,
        t.student_status AS studentStatus,
        t.teacher_rating_key AS teacherRatingKey,
        t.teacher_rating_label AS teacherRatingLabel,
        t.warning_count AS warningCount,
        t.mistake_count AS mistakeCount,
        t.evaluation_score AS evaluationScore,
        t.evaluation_max_score AS evaluationMaxScore,
        t.points,
        t.teacher_completed AS teacherCompleted,
        (SELECT COALESCE(MAX(repeatTask.actual_repeat_count), 0)
         FROM student_quran_tasks repeatTask
         WHERE repeatTask.plan_id = t.plan_id AND repeatTask.student_id = t.student_id
           AND repeatTask.task_date = t.task_date AND repeatTask.task_type = 'repeat' AND repeatTask.track = t.track
           AND repeatTask.from_surah = t.from_surah AND repeatTask.from_ayah = t.from_ayah
           AND repeatTask.to_surah = t.to_surah AND repeatTask.to_ayah = t.to_ayah) AS actualRepeatCount,
        (SELECT COALESCE(MAX(repeatTask.actual_listening_count), 0)
         FROM student_quran_tasks repeatTask
         WHERE repeatTask.plan_id = t.plan_id AND repeatTask.student_id = t.student_id
           AND repeatTask.task_date = t.task_date AND repeatTask.task_type = 'repeat' AND repeatTask.track = t.track
           AND repeatTask.from_surah = t.from_surah AND repeatTask.from_ayah = t.from_ayah
           AND repeatTask.to_surah = t.to_surah AND repeatTask.to_ayah = t.to_ayah) AS actualListeningCount,
        sp.name AS teacherName,
        DATE_FORMAT(t.evaluated_at, '%Y-%m-%d %H:%i') AS evaluatedAt
      FROM student_quran_tasks t
      JOIN students s ON s.id = t.student_id
      LEFT JOIN committees c ON c.id = s.committee_id
      LEFT JOIN quran_surahs qsf ON qsf.surah_number = t.from_surah
      LEFT JOIN quran_surahs qst ON qst.surah_number = t.to_surah
      LEFT JOIN supervisors sp ON sp.id = t.evaluated_by
      WHERE t.student_id = ?
        AND t.task_type IN ('memorization', 'review', 'link')
        ${planView ? 'AND t.task_date <= ?' : 'AND t.teacher_completed IS NOT NULL'}
      ORDER BY sessionDate DESC, FIELD(t.task_type, 'memorization', 'review', 'link'), t.from_page ASC
      ${planView ? '' : 'LIMIT 200'}
      `,
      planView ? [studentId, today] : [studentId]
    );

    const marksByTask = await getQuranTaskDisplayMarks(db(), rows.map((row) => row.id));
    if (planView) await filterPlanMarksByLatestAttempt(db(), marksByTask);
    const resultRows = rows.map((row) => { const _resolveResultRows = () => {
                                             if (planView && row.taskDate === today) {
                                               return {
        repeatCount: Number(row.track === 'mastery' ? settings.masteryRepeatCount : settings.memorizationRepeatCount),
        listeningCount: Number(row.track === 'mastery' ? settings.masteryListeningCount : settings.memorizationListeningCount),
      };
                                             }
                                             return {};
                                           };
                                           return ({
      ...normalizeTaskRow(row, settings.quranReferenceMode),
      ...(_resolveResultRows()),
      sessionDate: row.sessionDate,
      teacherName: row.teacherName || 'المعلم',
      evaluatedAt: row.evaluatedAt || '',
      ayahMarks: marksByTask.get(Number(row.id)) || [],
    }); });
    if (planView && req.query.includePoints === '1') {
      const [[[student]], [transactions], [attendance]] = await Promise.all([
        db().query('SELECT points FROM students WHERE id = ?', [studentId]),
        db().query(`SELECT DATE_FORMAT(transaction_date, '%Y-%m-%d') date, transaction_type type,
          points, source_type source, reason FROM student_point_transactions
          WHERE student_id = ? AND transaction_date <= ? ORDER BY transaction_date, id`, [studentId, today]),
        db().query(`SELECT DATE_FORMAT(record_date, '%Y-%m-%d') date FROM attendance_records
          WHERE student_id = ? AND record_date <= ?`, [studentId, today]),
      ]);
      const points = buildStudentPlanPoints({ total: student?.points, transactions, attendance, today, rows });
      const grades = await computeStudentsWeeklyGrades(db(), { studentIds: [studentId], weekStart: weekStartOf(today), today });
      const currentGrade = grades.get(studentId);
      const weeklyGrade = currentGrade ? { total: currentGrade.total, max: currentGrade.max, weekStart: currentGrade.weekStart, weekEnd: currentGrade.weekEnd } : null;
      return res.json({ rows: studentVisibleTasks(resultRows, settings, req.auth?.role), points, weeklyGrade });
    }
    res.json(studentVisibleTasks(resultRows, settings, req.auth?.role));
  } catch (error) {
    next(error);
  }
});

app.get('/api/students/:id/quran-saved', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const studentId = Number(req.params.id || 0);
    if (!await canReadStudentQuranToday(req, studentId)) {
      return res.status(403).json({ message: 'ليست لديك صلاحية لعرض محفوظ هذا الطالب.' });
    }
    const juzs = await getStudentAvailableJuzs(connection, studentId);
    res.json(juzs.filter((juz) => Number(juz.progressPercent || 0) > 0));
  } catch (error) {
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/students/:id/quran-level', async (req, res, next) => {
  try {
    const studentId = Number(req.params.id || 0);
    if (!Number.isSafeInteger(studentId) || studentId <= 0 || !await canReadStudentQuranToday(req, studentId)) {
      return res.status(403).json({ message: 'ليست لديك صلاحية لعرض مستوى هذا الطالب.' });
    }
    const [student] = await loadStudentLevels({
      query: (sql, params) => db().query(sql, params),
      referenceConnection: db(),
      scope: { filter: (column) => `${column} = ?`, params: [studentId] },
      acceptedSql: acceptedMemorizationSql,
      today: getSaudiDateTimeParts().date,
    });
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود.' });
    res.set('Cache-Control', 'no-store').json({ ...student.level, since: student.since, days: student.days });
  } catch (error) {
    next(error);
  }
});

/** Remember the authenticated actor start date only when creating the first plan. */
/**
 * Review cursor for a continued plan: the first pending review that the edit is about to
 * discard is re-issued, otherwise the plan keeps its saved cursor.
 */
async function resolveContinuedReviewCursor(connection, plan, fromDate) {
  const [[pendingReview]] = await connection.query(
    `SELECT t.from_page AS fromPage
     FROM student_quran_tasks t
     WHERE t.plan_id = ?
       AND t.task_type = 'review'
       AND t.task_date >= ?
       AND t.teacher_completed IS NULL
       AND COALESCE(t.student_status, 'not_done') <> 'done'
       AND NOT EXISTS (
         SELECT 1 FROM student_quran_recitation_attempts attempt
         WHERE attempt.task_id = t.id AND attempt.is_official = 1
       )
     ORDER BY t.task_date, t.id
     LIMIT 1`,
    [plan.id, fromDate],
  );
  return Number(pendingReview?.fromPage || plan.nextReviewPage || 0) || null;
}

async function saveInitialPlanDatePreference(existingPlan, startDate, connection, req) {
  if (!existingPlan && startDate) {
    await connection.query(
      `INSERT INTO quran_plan_user_preferences (actor_role, actor_id, last_start_date)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE last_start_date = VALUES(last_start_date)`,
      [String(req.auth?.role || 'manager'), Number(req.auth?.id || 0), startDate]
    );
  }
}

/** Resolve the selected Quran page or ayah endpoints and their persisted coordinates. */
async function resolvePlanPositions({ requestedStartBoundary, startSurah, startAyah, requestedEndBoundary, endSurah, endAyah, connection }) {
  if (requestedStartBoundary) {
    const boundary = requestedStartBoundary.start;
    startSurah = Number(boundary.surah);
    startAyah = Number(boundary.ayah);
  }
  if (requestedEndBoundary) {
    const boundary = requestedEndBoundary.end;
    endSurah = Number(boundary.surah);
    endAyah = Number(boundary.ayah);
  }
  const start = requestedStartBoundary
    ? requestedStartBoundary.start
    : await getQuranAyah(connection, startSurah, startAyah);
  const end = requestedEndBoundary
    ? requestedEndBoundary.end
    : await getQuranAyah(connection, endSurah, endAyah);
  return { start, end, startSurah, startAyah, endSurah, endAyah };
}

/** Resolve Quran page boundaries in the requested direction before validating the plan. */
async function resolveRequestedPlanPageBounds(requestedStartPage, requestedEndPage, connection) {
  const requestedPageDirection = requestedStartPage && requestedEndPage && requestedStartPage > requestedEndPage ? -1 : 1;
  const requestedStartBoundary = requestedStartPage
    ? await getQuranPageBoundaryInDirection(connection, requestedStartPage, requestedPageDirection)
    : null;
  const requestedEndBoundary = requestedEndPage
    ? await getQuranPageBoundaryInDirection(connection, requestedEndPage, requestedPageDirection)
    : null;
  return { requestedStartBoundary, requestedEndBoundary };
}

/** Build unique execution choices from valid task bounds and the permitted traversal direction. */
async function getStudentReviewCycle(connection, plan, date, rows) {
  if (!rows.length) return null;
  const saved = await getStudentMemorizedRanges(connection, plan.studentId, { beforeDate: date });
  const [links] = await connection.query("SELECT from_page AS startPage, from_surah AS startSurah, from_ayah AS startAyah, to_page AS endPage, to_surah AS endSurah, to_ayah AS endAyah FROM student_quran_tasks WHERE student_id = ? AND task_date = ? AND task_type = 'link'", [plan.studentId, date]);
  return loadReviewCycle({ connection, plan, date, rows, ayahs: await readQuranRange(connection, 1, 604),
    isAvailable: ayah => quranPositionInRanges(ayah, saved) && !quranPositionInRanges(ayah, links),
    fallbackPage: await getReviewStartForDate(connection, plan, date) });
}

async function getStudentReviewEnd(connection, plan, date, start, expectedEnd) {
  const direction = getQuranRangeDirection(start, expectedEnd);
  const saved = await getStudentMemorizedRanges(connection, plan.studentId, { beforeDate: addUtcDays(date, 1) });
  const [links] = await connection.query(
    "SELECT from_page AS startPage, from_surah AS startSurah, from_ayah AS startAyah, to_page AS endPage, to_surah AS endSurah, to_ayah AS endAyah FROM student_quran_tasks WHERE student_id = ? AND task_date = ? AND task_type = 'link'",
    [plan.studentId, date],
  );
  const ayahs = await getQuranAyahsInPageRange(connection, direction < 0 ? 1 : expectedEnd.page, 604);
  return extendReviewEnd({ ayahs, expectedEnd, direction, isAvailable: ayah => quranPositionInRanges(ayah, saved) && !quranPositionInRanges(ayah, links) });
}

async function buildTodayExecutionAyahs({ rows, memorizationContext, plan, connection, executionAyahMap, executionAyahsByType, date }) {
  for (const row of rows) {
    const start = { page: Number(row.fromPage), surah: Number(row.fromSurah), ayah: Number(row.fromAyah) };
    const expectedEnd = { page: Number(row.toPage), surah: Number(row.toSurah), ayah: Number(row.toAyah) };
    if (!isValidQuranPosition(start) || !isValidQuranPosition(expectedEnd)) continue;
    const allowedEnd = row.taskType === 'review'
      ? await getStudentReviewEnd(connection, plan, date, start, expectedEnd)
      : row.taskType === 'memorization' && memorizationContext?.allowedEnd ? memorizationContext.allowedEnd : expectedEnd;
    const taskDirection = ['memorization', 'repeat'].includes(row.taskType)
      ? getQuranRangeDirection(
        { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
        { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) }
      )
      : getQuranRangeDirection(start, allowedEnd);
    const taskAyahs = await getQuranAyahsInPageRange(connection, start.page, allowedEnd.page);
    taskAyahs
      .filter((ayah) => compareQuranPositionInDirection(ayah, start, taskDirection) >= 0
        && compareQuranPositionInDirection(ayah, allowedEnd, taskDirection) <= 0)
      .forEach((ayah) => {
        executionAyahMap.set(`${ayah.surah}:${ayah.ayah}`, ayah);
        executionAyahsByType[row.taskType] ||= [];
        executionAyahsByType[row.taskType].push(ayah);
      });
  }
}

/** Preserve legacy ranking visibility when a specific visibility field is omitted. */
function requestedRankingVisibility(req) {
  const studentRankingsVisible = req.body.studentRankingsVisible === undefined
    ? req.body.rankingsVisible !== false && req.body.rankingsVisible !== 'false'
    : parseBoolean(req.body.studentRankingsVisible);
  const familyRankingsVisible = req.body.familyRankingsVisible === undefined
    ? req.body.rankingsVisible !== false && req.body.rankingsVisible !== 'false'
    : parseBoolean(req.body.familyRankingsVisible);
  return { studentRankingsVisible, familyRankingsVisible };
}

/** Index completed ranges by date to avoid counting superseded unsuccessful attempts. */
/** Generate current tasks only for students in the authenticated teacher or management scope. */
/** Preserve progress continuity when the official plan start and starting position are unchanged. */
async function resolveReplacementPlanAnchor({ existingPlan, startSurah, startAyah, startDate, effectiveFrom, connection, planSettings }) {
  let scheduleAnchor = null;
  const startPositionUnchanged = existingPlan
    && Number(existingPlan.startSurah) === Number(startSurah)
    && Number(existingPlan.startAyah) === Number(startAyah);
  const officialStartUnchanged = existingPlan?.startDate
    && existingPlan.startDate === startDate;
  if (officialStartUnchanged && startPositionUnchanged) {
    const previousScheduledDate = addUtcDays(effectiveFrom, -1);
    const previousContext = await getPlanProgressContext(connection, existingPlan, previousScheduledDate, planSettings);
    if (previousContext?.scheduledEnd) {
      scheduleAnchor = previousContext.scheduledEnd;
    }
  }
  const scheduleDays = getMemorizationScheduleDays(planSettings);
  return { scheduleDays, scheduleAnchor };
}

/** Preserve existing teacher and reciter modes when saving unrelated settings. */
function retainedRecitationModes(previousSettings) {
  const teacherMemorizationRecitationMode = previousSettings.teacherMemorizationRecitationMode === 'count'
    ? 'count'
    : 'mushaf';
  const teacherReviewRecitationMode = previousSettings.teacherReviewRecitationMode === 'count' ? 'count' : 'mushaf';
  const teacherLinkRecitationMode = previousSettings.teacherLinkRecitationMode === 'count' ? 'count' : 'mushaf';
  const reciterMemorizationRecitationMode = previousSettings.reciterMemorizationRecitationMode === 'count'
    ? 'count'
    : 'mushaf';
  const reciterReviewRecitationMode = previousSettings.reciterReviewRecitationMode === 'count' ? 'count' : 'mushaf';
  const reciterLinkRecitationMode = previousSettings.reciterLinkRecitationMode === 'count' ? 'count' : 'mushaf';
  return { teacherMemorizationRecitationMode, teacherReviewRecitationMode, teacherLinkRecitationMode, reciterMemorizationRecitationMode, reciterReviewRecitationMode, reciterLinkRecitationMode };
}

/** Normalize this settings group while preserving omitted values and the existing defaults. */
function buildEvaluationSettingsUpdate({ req, previousSettings, teacherMemorizationRecitationMode, teacherReviewRecitationMode, teacherLinkRecitationMode, reciterMemorizationRecitationMode, reciterReviewRecitationMode, reciterLinkRecitationMode }) {
  return {
    recitationAttendanceSource: req.body.recitationAttendanceSource === 'teacher' ? 'teacher' : 'supervisor',
    teacherMemorizationRecitationMode,
    teacherReviewRecitationMode,
    teacherLinkRecitationMode,
    reciterMemorizationRecitationMode,
    reciterReviewRecitationMode,
    reciterLinkRecitationMode,
    memorizationRecitationMode: teacherMemorizationRecitationMode,
    masteryRecitationMode: teacherMemorizationRecitationMode,
    reviewRecitationMode: teacherReviewRecitationMode,
    linkRecitationMode: teacherLinkRecitationMode,
    narrationMaxScore: Number(req.body.narrationMaxScore ?? previousSettings.narrationMaxScore ?? 100),
    narrationWarningDeduction: Math.max(0, Number(req.body.narrationWarningDeduction ?? previousSettings.narrationWarningDeduction ?? 1)),
    narrationMistakeDeduction: Math.max(0, Number(req.body.narrationMistakeDeduction ?? previousSettings.narrationMistakeDeduction ?? 5)),
    narrationStartTemplate: req.body.narrationStartTemplate === undefined ? String(previousSettings.narrationStartTemplate || '') : String(req.body.narrationStartTemplate || ''),
    narrationEndTemplate: req.body.narrationEndTemplate === undefined ? String(previousSettings.narrationEndTemplate || '') : String(req.body.narrationEndTemplate || ''),
    narrationResultTemplate: req.body.narrationResultTemplate === undefined ? String(previousSettings.narrationResultTemplate || '') : String(req.body.narrationResultTemplate || ''),
    memorizationRepeatCount: normalizeRepeatCount(req.body.memorizationRepeatCount, previousSettings.memorizationRepeatCount ?? 1),
    masteryRepeatCount: normalizeRepeatCount(req.body.masteryRepeatCount, previousSettings.masteryRepeatCount ?? 1),
    memorizationListeningCount: normalizeRepeatCount(req.body.memorizationListeningCount, previousSettings.memorizationListeningCount ?? 3),
    masteryListeningCount: normalizeRepeatCount(req.body.masteryListeningCount, previousSettings.masteryListeningCount ?? 3),
    allowRepeatCountEditing: false,
    allowListeningCountEditing: false
  };
}

/** Normalize this settings group while preserving omitted values and the existing defaults. */
function buildExecutionEditingSettingsUpdate(req, previousSettings) {
  return {
    hideStudentMemorizationAmount: req.body.hideStudentMemorizationAmount === undefined ? previousSettings.hideStudentMemorizationAmount !== false : parseBoolean(req.body.hideStudentMemorizationAmount),
    hideStudentReviewAmount: req.body.hideStudentReviewAmount === undefined ? previousSettings.hideStudentReviewAmount !== false : parseBoolean(req.body.hideStudentReviewAmount),
    hideStudentLinkAmount: req.body.hideStudentLinkAmount === undefined ? previousSettings.hideStudentLinkAmount !== false : parseBoolean(req.body.hideStudentLinkAmount),
    hideStudentAmounts: req.body.hideStudentAmounts === undefined
      ? Boolean(previousSettings.hideStudentAmounts)
      : parseBoolean(req.body.hideStudentAmounts),
    studentTaskAmountEditable: req.body.studentTaskAmountEditable === undefined
      ? previousSettings.studentTaskAmountEditable !== false
      : parseBoolean(req.body.studentTaskAmountEditable),
    studentReviewAmountEditable: req.body.studentReviewAmountEditable === undefined
      ? previousSettings.studentReviewAmountEditable !== false
      : parseBoolean(req.body.studentReviewAmountEditable),
    studentLinkAmountEditable: false,
    allowQuranCompensation: req.body.allowQuranCompensation === undefined
      ? previousSettings.allowQuranCompensation !== false
      : parseBoolean(req.body.allowQuranCompensation),
    allowQuranExtra: req.body.allowQuranExtra === undefined
      ? Boolean(previousSettings.allowQuranExtra)
      : parseBoolean(req.body.allowQuranExtra)
  };
}

/** Normalize this settings group while preserving omitted values and the existing defaults. */
function buildExecutionSourceSettingsUpdate(req, previousSettings) {
  return {
    // Session days and holidays follow the grading weekly program and are saved from its settings only.
    weeklyHolidayDays: normalizeWeeklyHolidayDays(previousSettings.weeklyHolidayDays),
    holidayTaskTypes: normalizeHolidayTaskTypes(req.body.holidayTaskTypes),
    recitationSessionDays: normalizeWeekDayList(previousSettings.recitationSessionDays, DEFAULT_RECITATION_SESSION_DAYS),
    memorizationExecutionSource: normalizeQuranExecutionSource(
      req.body.memorizationExecutionSource,
      previousSettings.memorizationExecutionSource || 'teacher'
    ),
    reviewExecutionSource: normalizeQuranExecutionSource(req.body.reviewExecutionSource, previousSettings.reviewExecutionSource || 'student'),
    linkExecutionSource: normalizeQuranExecutionSource(req.body.linkExecutionSource, previousSettings.linkExecutionSource || 'student'),
    repeatExecutionSource: normalizeQuranExecutionSource(
      req.body.memorizationExecutionSource,
      previousSettings.memorizationExecutionSource || 'teacher'
    ),
    recitationAmountDay: normalizeRecitationAmountDay(req.body.recitationAmountDay ?? previousSettings.recitationAmountDay)
  };
}

/** Normalize this settings group while preserving omitted values and the existing defaults. */
function buildRegistrationSettingsUpdate(req, previousSettings) {
  return {
    registrationEnabled: req.body.registrationEnabled === undefined
      ? Boolean(previousSettings.registrationEnabled)
      : parseBoolean(req.body.registrationEnabled),
    registrationPreAcceptTemplate: req.body.registrationPreAcceptTemplate === undefined
      ? String(previousSettings.registrationPreAcceptTemplate || '')
      : String(req.body.registrationPreAcceptTemplate || ''),
    registrationAcceptTemplate: req.body.registrationAcceptTemplate === undefined
      ? String(previousSettings.registrationAcceptTemplate || '')
      : String(req.body.registrationAcceptTemplate || ''),
    registrationRejectTemplate: req.body.registrationRejectTemplate === undefined
      ? String(previousSettings.registrationRejectTemplate || '')
      : String(req.body.registrationRejectTemplate || ''),
  };
}

/** Normalize this settings group while preserving omitted values and the existing defaults. */
function buildNotificationSettingsUpdate(req, previousSettings, _resolveQuranReferenceMode) {
  return {
    attendanceAbsentTemplate: req.body.attendanceAbsentTemplate ?? previousSettings.attendanceAbsentTemplate ?? '',
    automaticAbsenceMessageEnabled: req.body.automaticAbsenceMessageEnabled === undefined
      ? Boolean(previousSettings.automaticAbsenceMessageEnabled)
      : parseBoolean(req.body.automaticAbsenceMessageEnabled),
    automaticExecutionMessageEnabled: req.body.automaticExecutionMessageEnabled === undefined
      ? Boolean(previousSettings.automaticExecutionMessageEnabled)
      : parseBoolean(req.body.automaticExecutionMessageEnabled),
    automaticExecutionMessageTime: '23:59',
    executionReminderTemplate: req.body.executionReminderTemplate === undefined
      ? String(previousSettings.executionReminderTemplate || '')
      : String(req.body.executionReminderTemplate || ''),
    executionReminderExcludedStudentIds: req.body.executionReminderExcludedStudentIds === undefined
      ? normalizePositiveIdList(previousSettings.executionReminderExcludedStudentIds)
      : normalizePositiveIdList(req.body.executionReminderExcludedStudentIds),
    quranReferenceMode: _resolveQuranReferenceMode()
  };
}

/** Normalize this settings group while preserving omitted values and the existing defaults. */
function buildAttendanceSettingsUpdate(req, _resolveStaffAttendanceSource, previousSettings) {
  return {
    attendanceDays: [0, 3],
    attendanceManualEnabled: parseBoolean(req.body.attendanceManualEnabled),
    attendanceAccountEnabled: req.body.attendanceAccountEnabled === true || req.body.attendanceAccountEnabled === 'true',
    allowEarlyAttendance: true,
    attendanceStartTime: '16:00',
    attendanceLocationUrl: '',
    attendanceLocationLat: null,
    attendanceLocationLng: null,
    staffAttendanceSource: _resolveStaffAttendanceSource(),
    staffAttendanceLocationUrl: req.body.staffAttendanceLocationUrl === undefined
      ? String(previousSettings.staffAttendanceLocationUrl || '')
      : String(req.body.staffAttendanceLocationUrl || '').trim(),
    staffAttendanceLocationLat: previousSettings.staffAttendanceLocationLat,
    staffAttendanceLocationLng: previousSettings.staffAttendanceLocationLng,
    staffAttendanceLateAfterAsrMinutes: Math.trunc(Number(
      req.body.staffAttendanceLateAfterAsrMinutes ?? previousSettings.staffAttendanceLateAfterAsrMinutes ?? 50
    ))
  };
}

/** Normalize this settings group while preserving omitted values and the existing defaults. */
function buildRewardSettingsUpdate(req, studentRankingsVisible, familyRankingsVisible, previousSettings) {
  return {
    maxSupervisorStudentPoints: Number(req.body.maxSupervisorStudentPoints || 0),
    maxDailyStudentPoints: 0,
    maxSupervisorFamilyItemsPoints: Number(req.body.maxSupervisorFamilyItemsPoints || 0),
    maxSupervisorDeductionPoints: Number(req.body.maxSupervisorDeductionPoints || 0),
    familyPointsAddToStudents: parseBoolean(req.body.familyPointsAddToStudents),
    familyPointsAddToAbsentStudents: parseBoolean(req.body.familyPointsAddToAbsentStudents),
    studentPointsAddToFamily: parseBoolean(req.body.studentPointsAddToFamily),
    familyEvaluationScope: FAMILY_EVALUATION_SCOPES.has(req.body.familyEvaluationScope)
      ? req.body.familyEvaluationScope
      : 'program_supervisor',
    activityLogEnabled: false,
    rankingsVisible: studentRankingsVisible || familyRankingsVisible,
    studentRankingsVisible,
    familyRankingsVisible,
    familyRankingMode: req.body.familyRankingMode === undefined
      ? previousSettings.familyRankingMode
      : normalizeFamilyRankingMode(req.body.familyRankingMode),
    rankingPointsVisible: req.body.rankingPointsVisible !== false && req.body.rankingPointsVisible !== 'false',
    teacherManualPointsEnabled: parseBoolean(req.body.teacherManualPointsEnabled),
    teacherManualPointsTermLimit: Math.max(0, Math.trunc(Number(req.body.teacherManualPointsTermLimit ?? previousSettings.teacherManualPointsTermLimit ?? 100))),
    teacherPointTypes: req.body.teacherPointTypes === undefined
      ? normalizeTeacherPointTypes(previousSettings.teacherPointTypes)
      : normalizeTeacherPointTypes(req.body.teacherPointTypes),
    storeEnabled: Boolean(previousSettings.storeEnabled),
    storePurchaseDeductsRanking: Boolean(previousSettings.storePurchaseDeductsRanking),
  };
}

/** Count validated word mistakes or normalize the manual mistake count. */
function countNarrationMistakes(evaluationMode, normalizedWordMarks, req) {
  return evaluationMode === 'mushaf'
    ? normalizedWordMarks.filter((mark) => isMistakeMark(mark.markType)).length
    : Math.max(0, Number(req.body.mistakeCount || 0));
}

/** Count validated word warnings or normalize the manual warning count. */
function countNarrationWarnings(evaluationMode, normalizedWordMarks, req) {
  return evaluationMode === 'mushaf'
    ? normalizedWordMarks.filter((mark) => mark.markType === 'warning').length
    : Math.max(0, Number(req.body.warningCount || 0));
}

/** Snapshot each eligible student range within the narration event transaction. */
async function createNarrationStudentEntries({ students, connection, startDate, juzRanges, created, included }) {
  for (const student of students) {
    const memorized = await mergeQuranRanges(connection, await getStudentMemorizedRanges(connection, student.id, { beforeDate: addUtcDays(startDate, 1) }));
    const parts = [];
    await collectNarrationJuzParts(memorized, juzRanges, parts, connection);
    if (!parts.length) continue;
    const totalFaces = parts.reduce((sum, part) => sum + Number(part.faces || 0), 0);
    const [studentResult] = await connection.query(
      `INSERT INTO narration_event_students (event_id, student_id, student_name, committee_id, committee_name, total_faces) VALUES (?, ?, ?, ?, ?, ?)`,
      [created.insertId, student.id, student.name, student.committeeId, student.committeeName, totalFaces]
    );
    await connection.query(
      `INSERT INTO narration_event_parts (event_student_id, juz_number, start_surah, start_ayah, start_page, end_surah, end_ayah, end_page, faces) VALUES ?`,
      [parts.map((part) => [studentResult.insertId, part.juz, part.start.surah, part.start.ayah, part.start.page, part.end.surah, part.end.ayah, part.end.page, part.faces])]
    );
    included += 1;
  }
  return included;
}

/** Intersect memorized ranges with juz boundaries and measure their covered faces. */
async function collectNarrationJuzParts(memorized, juzRanges, parts, connection) {
  for (const range of memorized) {
    for (const juz of juzRanges) {
      const start = compareQuranPosition(getQuranRangeStart(range), getQuranRangeStart(juz)) > 0 ? getQuranRangeStart(range) : getQuranRangeStart(juz);
      const end = compareQuranPosition(getQuranRangeEnd(range), getQuranRangeEnd(juz)) < 0 ? getQuranRangeEnd(range) : getQuranRangeEnd(juz);
      if (compareQuranPosition(start, end) <= 0) {
        parts.push({ juz: juz.juz, start, end, faces: await calculateQuranRangeFaces(connection, { startPage: start.page, startSurah: start.surah, startAyah: start.ayah, endPage: end.page, endSurah: end.surah, endAyah: end.ayah }) });
      }
    }
  }
}

async function getStudentQuranReviewHistory(connection, studentId, referenceMode) {
  const [rows] = await connection.query(
      `
      SELECT
        t.id,
        t.plan_id AS planId,
        t.student_id AS studentId,
        DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
        t.task_type AS taskType,
        t.track,
        t.from_page AS fromPage,
        t.to_page AS toPage,
        t.from_surah AS fromSurah,
        t.from_ayah AS fromAyah,
        t.to_surah AS toSurah,
        t.to_ayah AS toAyah,
        qsf.name_arabic AS fromSurahName,
        qst.name_arabic AS toSurahName,
        t.target_pages AS targetPages,
        t.review_execution_json AS reviewExecution,
        t.actual_to_page AS actualToPage,
        t.actual_to_surah AS actualToSurah,
        t.actual_to_ayah AS actualToAyah,
        qsa.name_arabic AS actualToSurahName,
        t.execution_state AS executionState,
        t.student_status AS studentStatus,
        t.teacher_completed AS teacherCompleted
      FROM student_quran_tasks t
      LEFT JOIN quran_surahs qsf ON qsf.surah_number = t.from_surah
      LEFT JOIN quran_surahs qst ON qst.surah_number = t.to_surah
      LEFT JOIN quran_surahs qsa ON qsa.surah_number = t.actual_to_surah
      WHERE t.student_id = ?
        AND t.task_type = 'review'
        AND t.student_status = 'done'
      ORDER BY t.task_date DESC, t.id DESC
      `,
      [studentId]
  );
  return rows.map((row) => normalizeTaskRow(row, referenceMode));
}

async function buildStudentReviewHistoryPdf({ student, rows }) {
  return await new Promise((resolve, reject) => {
    const { doc, regularFont, boldFont } = createBufferedPdf({ size: 'A4', margin: 36, bufferPages: true }, resolvePdfFontPair(), resolve, reject);

    const margin = 36;
    const width = doc.page.width - (margin * 2);
    const bottom = doc.page.height - margin;
    const primary = '#00ad9f';
    const text = '#0f172a';
    const muted = '#64748b';
    let y = margin;

    const write = (value, options = {}) => {
      const size = options.size || 11;
      doc.fillColor(options.color || text)
        .font(options.font || regularFont)
        .fontSize(size)
        .text(String(value ?? ''), margin, y, {
          width,
          align: options.align || 'right',
          lineGap: options.lineGap || 2,
        });
      y = doc.y + (options.after ?? 6);
    };
    const drawHeader = () => {
      doc.roundedRect(margin, margin, width, 70, 12).fill('#eff9fc').stroke('#b6e3ef');
      y = margin + 14;
      write('سجل المراجعة الكامل', { size: 19, color: primary, font: boldFont, after: 4 });
      write(`${student.name} | ${student.committeeName || 'بدون حلقة'}`, { size: 10, color: muted, font: boldFont, after: 16 });
    };
    const ensureSpace = (height = 60) => {
      if (y + height <= bottom) return;
      doc.addPage();
      drawHeader();
    };

    drawHeader();
    if (rows.length === 0) {
      y += 18;
      write('لا توجد مراجعة منفذة حتى الآن.', { size: 15, color: muted, font: boldFont, align: 'center' });
      doc.end();
      return;
    }

    const grouped = new Map();
    rows.forEach((task) => {
      const date = task.taskDate || '-';
      if (!grouped.has(date)) grouped.set(date, []);
      grouped.get(date).push(task);
    });
    grouped.forEach((tasks, date) => {
      ensureSpace(52 + (tasks.length * 28));
      doc.roundedRect(margin, y, width, 26, 7).fill('#dff4fa').stroke('#bddfeb');
      y += 6;
      write(date, { size: 11, color: primary, font: boldFont, after: 10 });
      tasks.forEach((task) => {
        ensureSpace(36);
        const label = task.actualPreview || task.preview || '-';
        doc.roundedRect(margin, y, width, 27, 6).fill('#ffffff').stroke('#d9edf4');
        y += 6;
        write(label, { size: 10.5, font: boldFont, after: 9 });
      });
      y += 3;
    });
    doc.end();
  });
}

app.get('/api/students/:id/quran-review-history', async (req, res, next) => {
  try {
    const studentId = Number(req.params.id || 0);
    if (!await canReadStudentQuranToday(req, studentId)) {
      return res.status(403).json({ message: 'ليست لديك صلاحية لعرض مراجعة هذا الطالب.' });
    }

    const settings = await loadSettings();
    const rows = await getStudentQuranReviewHistory(db(), studentId, settings.quranReferenceMode);

    res.json({
      quranReferenceMode: settings.quranReferenceMode,
      rows,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/students/:id/quran-review-history/export', async (req, res, next) => {
  try {
    const studentId = Number(req.params.id || 0);
    if (!await canReadStudentQuranToday(req, studentId)) {
      return res.status(403).json({ message: 'ليست لديك صلاحية لتصدير مراجعة هذا الطالب.' });
    }
    const [[student]] = await db().query(
      `
      SELECT s.name, c.name AS committeeName
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      WHERE s.id = ?
      LIMIT 1
      `,
      [studentId]
    );
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود.' });

    const settings = await loadSettings();
    const rows = await getStudentQuranReviewHistory(db(), studentId, settings.quranReferenceMode);
    const buffer = await buildStudentReviewHistoryPdf({ student, rows });
    setDownloadHeaders(res, `سجل-مراجعة-${student.name}.pdf`, 'application/pdf');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

function taskStartPosition(task) {
  return {
    page: Number(task.fromPage),
    surah: Number(task.fromSurah),
    surahName: task.fromSurahName || '',
    ayah: Number(task.fromAyah),
  };
}

function taskEndPosition(task) {
  return {
    page: Number(task.toPage),
    surah: Number(task.toSurah),
    surahName: task.toSurahName || '',
    ayah: Number(task.toAyah),
  };
}

function isSameQuranPosition(first, second) {
  return Number(first?.page) === Number(second?.page)
    && Number(first?.surah) === Number(second?.surah)
    && Number(first?.ayah) === Number(second?.ayah);
}

const toQuranExecutionOption = ({ page, surah, surahName, ayah }) => ({
  page: Number(page),
  surah: Number(surah),
  surahName,
  ayah: Number(ayah),
});

function getAllowedExecutionEndPage(plan, expectedEnd, taskType) {
  const expectedPage = Number(expectedEnd?.page || 0);
  if (!expectedPage) return 0;
  const followsPlanDirection = ['memorization', 'repeat'].includes(taskType);
  const direction = followsPlanDirection && Number(plan?.startPage) > Number(plan?.endPage) ? -1 : 1;
  const planEndPage = followsPlanDirection ? Number(plan?.endPage || expectedPage) : 604;
  const pageAllowance = QURAN_EXTRA_FORWARD_FACES;
  return direction > 0
    ? Math.min(planEndPage, expectedPage + pageAllowance)
    : Math.max(planEndPage, expectedPage - pageAllowance);
}

async function resolveExecutionEndPosition(connection, rawEnd, fallbackEnd, direction = 1) {
  const page = Number(rawEnd?.page || rawEnd?.toPage || 0);
  const surah = Number(rawEnd?.surah || rawEnd?.toSurah || 0);
  const ayah = Number(rawEnd?.ayah || rawEnd?.toAyah || 0);
  if (!page && !surah && !ayah) return fallbackEnd;
  const row = surah && ayah ? await getQuranAyah(connection, surah, ayah) : null;
  if (row && (!page || Number(row.page) === page)) return { page: Number(row.page), surah: Number(row.surah), ayah: Number(row.ayah) };
  if (page && !surah && !ayah) {
    const boundary = await getQuranPageBoundaryInDirection(connection, page, direction);
    if (boundary) return boundary.end;
  }
  return null;
}

async function getAllowedExecutionEnd(connection, plan, expectedEnd, taskType) {
  const followsPlanDirection = ['memorization', 'repeat'].includes(taskType);
  if (followsPlanDirection) {
    const planEnd = { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) };
    const planStart = { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) };
    const direction = getQuranRangeDirection(planStart, planEnd);
    if (compareQuranPositionInDirection(expectedEnd, planEnd, direction) >= 0) return planEnd;
    const extraStart = await getAdjacentQuranAyahInDirection(connection, expectedEnd, direction);
    const allowedRange = extraStart
      ? await buildQuranRangeByFaceTarget(connection, extraStart, planEnd, QURAN_EXTRA_FORWARD_FACES)
      : null;
    return allowedRange?.end || expectedEnd;
  }
  const allowedPage = getAllowedExecutionEndPage(plan, expectedEnd, taskType);
  const boundary = await getQuranPageBoundaryInDirection(connection, allowedPage, 1);
  return boundary?.end || expectedEnd;
}

async function updatePlanCursorAfterExecution(connection, plan, taskType, actualEnd) {
  if (!actualEnd || !plan?.id) return;
  if (taskType === 'memorization') {
    const next = await recomputePlanMemorizationCursor(connection, plan);
    const direction = getQuranRangeDirection(
      { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
      { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) },
    );
    if (next && compareQuranPositionInDirection(next, actualEnd, direction) <= 0) {
      const error = new Error(`يوجد حفظ غير مسجل عند الوجه ${next.page}، الآية ${next.ayah}. أكمل تسجيله قبل الانتقال لما بعده.`);
      error.statusCode = 409;
      throw error;
    }
    return;
  }

  await advanceReviewCursorAfterExecution(taskType, connection, actualEnd, plan);
}

/** Advance a review cursor only after a full page boundary has been reached. */
async function advanceReviewCursorAfterExecution(taskType, connection, actualEnd, plan) {
  if (taskType === 'review') {
    const boundary = await getQuranPageBoundary(connection, actualEnd.page);
    const nextPage = boundary?.end && isSameQuranPosition(actualEnd, boundary.end)
      ? Number(actualEnd.page) + 1
      : Number(actualEnd.page);
    await connection.query(
      'UPDATE student_quran_plans SET next_review_page = ? WHERE id = ?',
      [nextPage, plan.id]
    );
  }
}

async function recomputePlanMemorizationCursor(connection, plan) {
  const direction = getQuranRangeDirection(
    { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
    { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) },
  );
  const next = await getNextUnmemorizedPlanPosition(connection, plan);
  const awaitingApproval = !next && await getNextUnmemorizedPlanPosition(connection, plan, { approvedOnly: true });
  await connection.query(
    `UPDATE student_quran_plans
     SET next_memorization_page = ?, next_memorization_surah = ?, next_memorization_ayah = ?,
         status = CASE
           WHEN ? IS NULL THEN 'completed'
           WHEN status = 'completed' THEN 'active'
           ELSE status
         END
     WHERE id = ?`,
    [
      next?.page || Number(plan.endPage) + direction,
      next?.surah || null,
      next?.ayah || null,
      next?.page || awaitingApproval?.page || null,
      plan.id,
    ],
  );
  return next;
}

async function buildExecutionSegmentDetails(connection, context, actualEnd, settings) {
  return buildRecitationSegmentDetails(connection, context, actualEnd, settings, {
    adjacentPosition: getAdjacentQuranAyahInDirection, rangeFaces: calculateQuranRangeFaces,
  });
}

async function saveQuranExecutionSegments(connection, {
  plan,
  date,
  sourceType,
  sourceId,
  segments,
}) {
  await connection.query(
    `UPDATE student_quran_execution_segments
     SET is_current = 0
     WHERE plan_id = ? AND task_date = ? AND task_type = ? AND source_type = ? AND is_current = 1`,
    [plan.id, date, plan.track === 'mastery' ? 'mastery' : 'memorization', sourceType],
  );
  for (const segment of segments) {
    await connection.query(
      `INSERT INTO student_quran_execution_segments
        (plan_id, student_id, task_date, task_type, source_type, source_id, segment_type,
         from_page, from_surah, from_ayah, to_page, to_surah, to_ayah,
         amount_faces, is_current)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        plan.id,
        plan.studentId,
        date,
        plan.track === 'mastery' ? 'mastery' : 'memorization',
        sourceType,
        sourceId || null,
        segment.type,
        segment.start.page,
        segment.start.surah,
        segment.start.ayah,
        segment.end.page,
        segment.end.surah,
        segment.end.ayah,
        segment.amount,
      ],
    );
  }
}

const executeStudentQuranTasks = async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const studentId = Number(req.params.id || 0);
    const rejectForeignStudentExecutionResult = await rejectForeignStudentExecution({ req, studentId, res });
    if (rejectForeignStudentExecutionResult) { return rejectForeignStudentExecutionResult; }

    const settings = await loadSettings();

    const taskIds = [...new Set((Array.isArray(req.body.taskIds) ? req.body.taskIds : [req.body.taskId]).map(Number).filter(Boolean))];
    if (!taskIds.length) return res.status(422).json({ message: 'اختر مهمة للتنفيذ.' });
    const status = req.body.status === 'done' ? 'done' : 'not_done';

    await connection.beginTransaction();
    const placeholders = taskIds.map(() => '?').join(',');
    const [taskRows] = await connection.query(
      `
      SELECT
        t.id,
        t.plan_id AS planId,
        t.student_id AS studentId,
        DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
        t.task_type AS taskType,
        t.track,
        t.from_page AS fromPage,
        t.to_page AS toPage,
        t.from_surah AS fromSurah,
        t.from_ayah AS fromAyah,
        t.to_surah AS toSurah,
        t.to_ayah AS toAyah,
        t.target_pages AS targetPages,
        t.review_execution_json AS reviewExecution,
        t.normal_to_page AS normalToPage,
        t.normal_to_surah AS normalToSurah,
        t.normal_to_ayah AS normalToAyah,
        t.scheduled_to_page AS scheduledToPage,
        t.scheduled_to_surah AS scheduledToSurah,
        t.scheduled_to_ayah AS scheduledToAyah,
        t.student_status AS studentStatus,
        t.execution_actor_role AS executionActorRole,
        p.id AS planId,
        p.start_surah AS startSurah,
        p.start_ayah AS startAyah,
        p.start_page AS startPage,
        p.end_surah AS endSurah,
        p.end_ayah AS endAyah,
        p.end_page AS endPage,
        p.daily_pages AS dailyPages,
        DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(p.effective_from, '%Y-%m-%d') AS effectiveFrom,
        p.schedule_days_json AS scheduleDays,
        p.schedule_anchor_page AS scheduleAnchorPage,
        p.schedule_anchor_surah AS scheduleAnchorSurah,
        p.schedule_anchor_ayah AS scheduleAnchorAyah
      FROM student_quran_tasks t
      JOIN student_quran_plans p ON p.id = t.plan_id
      WHERE t.id IN (${placeholders})
        AND t.student_id = ?
        AND t.teacher_completed IS NULL
        AND t.compensation_index = 0
      FOR UPDATE
      `,
      [...taskIds, studentId]
    );
    const rejectMissingExecutionTasksResult = await rejectMissingExecutionTasks({ taskRows, taskIds, connection, res });
    if (rejectMissingExecutionTasksResult) { return rejectMissingExecutionTasksResult; }


    const first = taskRows[0];
    const rejectInvalidExecutionGroupResult = await rejectInvalidExecutionGroup({ taskRows, first, connection, settings, res });
    if (rejectInvalidExecutionGroupResult) { return rejectInvalidExecutionGroupResult; }
    const plan = {
      id: first.planId,
      studentId: first.studentId,
      track: first.track,
      startSurah: first.startSurah,
      startAyah: first.startAyah,
      startPage: first.startPage,
      endSurah: first.endSurah,
      endAyah: first.endAyah,
      endPage: first.endPage,
      dailyPages: first.dailyPages,
      startDate: first.startDate,
      effectiveFrom: first.effectiveFrom,
      scheduleDays: first.scheduleDays,
      scheduleAnchorPage: first.scheduleAnchorPage,
      scheduleAnchorSurah: first.scheduleAnchorSurah,
      scheduleAnchorAyah: first.scheduleAnchorAyah,
    };
    if (first.taskType === 'repeat') {
      return await executeRepeatTaskGroup({ first, settings, status, req, connection, placeholders, studentId, taskIds, res });
    }
    if (first.taskType === 'review' && (req.body.reviewFaces !== undefined || taskRows.some(row => row.reviewExecution))) {
      const [[group]] = await connection.query("SELECT COUNT(*) AS count FROM student_quran_tasks WHERE plan_id = ? AND task_date = ? AND task_type = 'review'", [first.planId, first.taskDate]);
      if (Number(group.count) !== taskRows.length) {
        await connection.rollback();
        return res.status(409).json({ message: 'أعد فتح المراجعة لتنفيذ مقدار اليوم كاملًا.' });
      }
      const cycle = await getStudentReviewCycle(connection, plan, first.taskDate, taskRows);
      let selection = null;
      try {
        if (status === 'done') selection = selectAuthorizedReview(cycle, req.body.reviewFaces ?? cycle.expectedFaces,
          settings.studentReviewAmountEditable);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        await connection.rollback();
        return res.status(422).json({ message: error.message });
      }
      await saveReviewCycle({ connection, tasks: taskRows, studentId, status, selection, expectedFaces: cycle.expectedFaces });
      await connection.commit();
      return res.json({ ok: true });
    }
    let { actualEnd, expectedEnd, executionDirection, expectedStart, tasks } = await prepareStudentExecutionRange({ plan, first, taskRows, status, connection, req });
    let memorizationContext = null;
    if (status === 'done') {
      const endComparison = compareQuranPositionInDirection(actualEnd, expectedEnd, executionDirection);
      const rejectDisabledExecutionEndChangeResult = await rejectDisabledExecutionEndChange({ settings, first, endComparison, connection, res });
      if (rejectDisabledExecutionEndChangeResult) { return rejectDisabledExecutionEndChangeResult; }

      memorizationContext = await loadExecutionMemorizationContext({ first, connection, plan, settings, expectedStart });
      let { isExpectedCompletion, allowedEnd } = await resolveStudentExecutionLimit({ first, expectedEnd, connection, plan, memorizationContext, actualEnd });
      const rejectOutOfRangeExecutionResult = await rejectOutOfRangeExecution({ actualEnd, expectedStart, expectedEnd, executionDirection, isExpectedCompletion, allowedEnd, connection, res });
      if (rejectOutOfRangeExecutionResult) { return rejectOutOfRangeExecutionResult; }
      tasks = await createExtraExecutionTasks({ actualEnd, expectedEnd, executionDirection, connection, plan, first, studentId, tasks });
    }

    tasks = await loadExecutionRepeatTasks({ first, connection, plan, studentId, tasks, executionDirection });

    const lastTaskIdByType = new Map();
    tasks.forEach((task) => lastTaskIdByType.set(task.taskType, Number(task.id)));

    await saveExecutedTaskRanges({ tasks, status, lastTaskIdByType, actualEnd, executionDirection, expectedEnd, connection, studentId });
    if (first.taskType === 'review') {
      await connection.query(`UPDATE student_quran_tasks SET review_execution_json = NULL WHERE student_id = ? AND id IN (${tasks.map(() => '?').join(',')})`, [studentId, ...tasks.map(task => task.id)]);
    }

    const _resolveExpectedRepeatCount4 = () => {
      if (first.taskType === 'memorization') {
        return Math.max(1, Number(first.track === 'mastery' ? settings.masteryRepeatCount : settings.memorizationRepeatCount));
      }
      return 0;
    };
    const expectedRepeatCount = _resolveExpectedRepeatCount4();
    const _resolveActualRepeatCount2 = () => {
      if (status === 'done' && first.taskType === 'memorization') {
        if (settings.allowRepeatCountEditing) {
          return practiceCompletionCount(req.body.repeatCount, expectedRepeatCount);
        }
        return expectedRepeatCount;
      }
      return 0;
    };
    const actualRepeatCount = _resolveActualRepeatCount2();
    const expectedListeningCount = getExpectedMemorizationListeningCount(first, settings);
    const _resolveActualListeningCount2 = () => {
      if (status === 'done' && expectedListeningCount > 0) {
        if (settings.allowListeningCountEditing) {
          return practiceCompletionCount(req.body.listeningCount, expectedListeningCount);
        }
        return expectedListeningCount;
      }
      return 0;
    };
    const actualListeningCount = _resolveActualListeningCount2();
    await saveExecutionRepeatCounts({ first, tasks, connection, actualRepeatCount, actualListeningCount, expectedRepeatCount, expectedListeningCount });

    const executionSegments = status === 'done' && first.taskType === 'memorization' && memorizationContext
      ? await buildExecutionSegmentDetails(connection, memorizationContext, actualEnd, settings)
      : [];
    await saveStudentExecutionSegments({ status, first, executionSegments, connection, plan, tasks });

    await refreshPlanAfterStudentExecution({ first, connection, plan, studentId, settings, status, actualEnd });

    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

app.post('/api/students/:id/quran-tasks/execution', executeStudentQuranTasks);
app.post('/api/students/:id/quran-tasks/:taskId/execution', (req, res, next) => {
  req.body = { ...req.body, taskIds: [req.params.taskId] };
  return executeStudentQuranTasks(req, res, next);
});

const shareTeacherPreparation = createSharedPreparation();
/** Load plan progress only for memorization before checking the permitted endpoint. */
async function loadExecutionMemorizationContext({ first, connection, plan, settings, expectedStart }) {
  return first.taskType === 'memorization'
    ? await getPlanProgressContext(connection, plan, first.taskDate, settings, expectedStart)
    : null;
}

/** Sort the owned task group in plan order and derive its expected and requested boundaries. */
async function prepareStudentExecutionRange({ plan, first, taskRows, status, connection, req }) {
  const planDirection = getQuranRangeDirection(
    { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
    { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) }
  );
  const executionDirection = ['memorization', 'repeat'].includes(first.taskType)
    ? planDirection
    : getQuranRangeDirection(taskStartPosition(first), taskEndPosition(first));
  let tasks = [...taskRows].sort((a, b) => (
    compareQuranPositionInDirection(taskStartPosition(a), taskStartPosition(b), executionDirection)
  ));
  const expectedStart = taskStartPosition(tasks[0]);
  const expectedEnd = taskEndPosition(tasks.at(-1));
  let actualEnd = status === 'done'
    ? await resolveExecutionEndPosition(connection, req.body.actualEnd, expectedEnd, executionDirection)
    : null;
  return { actualEnd, expectedEnd, executionDirection, expectedStart, tasks };
}

/** Save the completed student segments in the current execution transaction. */
async function saveStudentExecutionSegments({ status, first, executionSegments, connection, plan, tasks }) {
  if (status === 'done' && first.taskType === 'memorization' && executionSegments.length) {
    await saveQuranExecutionSegments(connection, {
      plan,
      date: first.taskDate,
      sourceType: 'student',
      sourceId: tasks.find((task) => task.taskType === 'memorization')?.id,
      segments: executionSegments,
    });
  }
}

/** Resolve the permitted endpoint from the task kind and plan progress. */
async function resolveStudentExecutionLimit({ first, expectedEnd, connection, plan, memorizationContext, actualEnd }) {
  let allowedEnd;
  if (first.taskType === 'review') {
    allowedEnd = await getStudentReviewEnd(connection, plan, first.taskDate, taskStartPosition(first), expectedEnd);
  } else if (first.taskType === 'link') {
    allowedEnd = expectedEnd;
  } else {
    allowedEnd = memorizationContext?.allowedEnd
      || await getAllowedExecutionEnd(connection, plan, expectedEnd, first.taskType);
  }
  const isExpectedCompletion = isSameQuranPosition(actualEnd, expectedEnd);
  return { isExpectedCompletion, allowedEnd };
}

/** Advance the plan cursor and refresh upcoming tasks after a completed student execution. */
async function refreshPlanAfterStudentExecution({ first, connection, plan, studentId, settings, status, actualEnd }) {
  if (status === 'done') {
    await updatePlanCursorAfterExecution(connection, plan, first.taskType, actualEnd);
    if (first.taskType === 'memorization') {
      const refreshedPlan = await getActivePlanForStudent(connection, studentId);
      await ensureStudentPlanTasks(connection, refreshedPlan, first.taskDate, settings);
    }
  }
}

/** Update repetition counts in one bound group query. */
async function saveExecutionRepeatCounts({ first, tasks, connection, actualRepeatCount, actualListeningCount, expectedRepeatCount, expectedListeningCount }) {
  if (first.taskType === 'memorization') {
    const repeatIds = tasks.filter((task) => task.taskType === 'repeat').map((task) => Number(task.id));
    if (repeatIds.length) {
      const repeatPlaceholders = repeatIds.map(() => '?').join(',');
      await connection.query(
        `UPDATE student_quran_tasks
           SET actual_repeat_count = ?,
               actual_listening_count = ?,
               execution_state = CASE WHEN ? < ? OR ? < ? THEN 'partial' ELSE execution_state END
           WHERE id IN (${repeatPlaceholders})`,
        [
          actualRepeatCount,
          actualListeningCount,
          actualRepeatCount,
          expectedRepeatCount,
          actualListeningCount,
          expectedListeningCount,
          ...repeatIds,
        ]
      );
    }
  }
}

/** Ensure and load paired repetition tasks using the caller transaction. */
async function loadExecutionRepeatTasks({ first, connection, plan, studentId, tasks, executionDirection }) {
  if (first.taskType === 'memorization') {
    await ensureRepeatTasksForMemorizationDate(connection, plan, first.taskDate);
    const [repeatTasks] = await connection.query(
      `
        SELECT
          id,
          plan_id AS planId,
          student_id AS studentId,
          DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate,
          task_type AS taskType,
          track,
          from_page AS fromPage,
          to_page AS toPage,
          from_surah AS fromSurah,
          from_ayah AS fromAyah,
          to_surah AS toSurah,
          to_ayah AS toAyah,
          target_pages AS targetPages
        FROM student_quran_tasks
        WHERE plan_id = ?
          AND student_id = ?
          AND task_date = ?
          AND task_type = 'repeat' AND track = ?
          AND teacher_completed IS NULL
        ORDER BY from_page ASC, from_surah ASC, from_ayah ASC
        FOR UPDATE
        `,
      [first.planId, studentId, first.taskDate, first.track]
    );
    tasks = [...tasks, ...repeatTasks].sort((a, b) => (
      compareQuranPositionInDirection(taskStartPosition(a), taskStartPosition(b), executionDirection)
    ));
  }
  return tasks;
}

/** Create bounded extra memorization tasks and reload their locked execution group. */
async function createExtraExecutionTasks({ actualEnd, expectedEnd, executionDirection, connection, plan, first, studentId, tasks }) {
  if (compareQuranPositionInDirection(actualEnd, expectedEnd, executionDirection) > 0) {
    let extraCursor = await getAdjacentQuranAyahInDirection(connection, expectedEnd, executionDirection);
    let extraGuard = 0;
    while (extraCursor
      && compareQuranPositionInDirection(extraCursor, actualEnd, executionDirection) <= 0
      && extraGuard < 1000) {
      const segmentEnd = await getQuranTraversalPageEnd(connection, extraCursor, actualEnd, executionDirection);
      await insertPlanTask(connection, {
        plan, date: first.taskDate, type: first.taskType, fromPage: extraCursor.page, toPage: segmentEnd.page, targetPages: null, bounds: {
          fromSurah: Number(extraCursor.surah),
          fromAyah: Number(extraCursor.ayah),
          toSurah: Number(segmentEnd.surah),
          toAyah: Number(segmentEnd.ayah),
        }
      });
      if (compareQuranPositionInDirection(segmentEnd, actualEnd, executionDirection) >= 0) break;
      extraCursor = await getAdjacentQuranAyahInDirection(connection, segmentEnd, executionDirection);
      extraGuard += 1;
    }
    const [refreshed] = await connection.query(
      `
          SELECT
            id,
            plan_id AS planId,
            student_id AS studentId,
            DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate,
            task_type AS taskType,
            from_page AS fromPage,
            to_page AS toPage,
            from_surah AS fromSurah,
            from_ayah AS fromAyah,
            to_surah AS toSurah,
            to_ayah AS toAyah,
            target_pages AS targetPages
          FROM student_quran_tasks
          WHERE plan_id = ? AND student_id = ? AND task_date = ? AND task_type = ? AND track = ?
          ORDER BY from_page ASC, from_surah ASC, from_ayah ASC
          FOR UPDATE
          `,
      [first.planId, studentId, first.taskDate, first.taskType, first.track]
    );
    tasks = refreshed.sort((a, b) => (
      compareQuranPositionInDirection(taskStartPosition(a), taskStartPosition(b), executionDirection)
    ));
  }
  return tasks;
}

/** Persist each task range within the caller transaction using bound values and the selected execution boundary. */
/** Derive status and exact boundaries without touching the database. */
function getTaskExecutionUpdate(task, { status, lastTaskIdByType, actualEnd, executionDirection, expectedEnd }) {
  let nextStatus = status;
  let actual = null;
  let executionState = null;
  if (status === 'done') {
      const start = taskStartPosition(task);
      const end = taskEndPosition(task);
      const isLastTask = Number(task.id) === lastTaskIdByType.get(task.taskType);
      if (compareQuranPositionInDirection(actualEnd, start, executionDirection) < 0) {
        nextStatus = 'not_done';
        executionState = 'partial';
      } else if (compareQuranPositionInDirection(actualEnd, end, executionDirection) < 0) {
        actual = actualEnd;
        executionState = 'partial';
      } else {
        actual = isLastTask && compareQuranPositionInDirection(actualEnd, end, executionDirection) > 0 ? actualEnd : end;
        executionState = compareQuranPositionInDirection(actual, expectedEnd, executionDirection) > 0 ? 'extra' : 'complete';
      }
    }
  return { id: task.id, status: nextStatus, page: actual?.page || null, surah: actual?.surah || null, ayah: actual?.ayah || null, executionState };
}

/** Batch the task group while retaining the caller's transaction and authorization guards. */
async function saveExecutedTaskRanges({ tasks, connection, studentId, ...context }) {
  const updates = tasks.map((task) => getTaskExecutionUpdate(task, context));
  await persistTaskExecutionUpdates(connection, updates, studentId);
}

async function executeRepeatTaskGroup({ first, settings, status, req, connection, placeholders, studentId, taskIds, res }) {
  const expectedRepeatCount = Math.max(1, Number(first.track === 'mastery'
    ? settings.masteryRepeatCount
    : settings.memorizationRepeatCount));
  const expectedListeningCount = normalizeRepeatCount(first.track === 'mastery'
    ? settings.masteryListeningCount
    : settings.memorizationListeningCount, 3);
  const _resolveActualRepeatCount = () => {
    if (status === 'done') {
      if (settings.allowRepeatCountEditing) {
        return practiceCompletionCount(req.body.repeatCount, expectedRepeatCount);
      }
      return expectedRepeatCount;
    }
    return 0;
  };
  const actualRepeatCount = _resolveActualRepeatCount();
  const _resolveActualListeningCount = () => {
    if (status === 'done') {
      if (settings.allowListeningCountEditing) {
        return practiceCompletionCount(req.body.listeningCount, expectedListeningCount);
      }
      return expectedListeningCount;
    }
    return 0;
  };
  const actualListeningCount = _resolveActualListeningCount();
  await connection.query(
    `UPDATE student_quran_tasks
         SET student_status = ?, actual_to_page = CASE WHEN ? = 'done' THEN to_page ELSE NULL END,
             actual_to_surah = CASE WHEN ? = 'done' THEN to_surah ELSE NULL END,
             actual_to_ayah = CASE WHEN ? = 'done' THEN to_ayah ELSE NULL END,
             actual_repeat_count = ?, actual_listening_count = ?,
             execution_state = CASE WHEN ? <> 'done' THEN NULL WHEN ? < ? OR ? < ? THEN 'partial' ELSE 'complete' END,
             execution_actor_role = 'student', execution_actor_id = ?, executed_at = NOW(3)
         WHERE id IN (${placeholders}) AND student_id = ?
           AND (execution_actor_role IS NULL OR execution_actor_role = 'student')`,
    [
      status, status, status, status,
      actualRepeatCount, actualListeningCount,
      status, actualRepeatCount, expectedRepeatCount, actualListeningCount, expectedListeningCount,
      studentId, ...taskIds, studentId,
    ]
  );
  await connection.commit();
  return res.json({ ok: true });
}

function ensureSupervisorTeacherModeTasks(connection, supervisorId, fromDate, toDate, settings) {
  const scope = JSON.stringify([getDatabaseContext().databaseName, supervisorId, fromDate, toDate, settings]);
  return shareTeacherPreparation(scope, () => buildSupervisorTeacherModeTasks(connection, supervisorId, fromDate, toDate, settings));
}

async function buildSupervisorTeacherModeTasks(
  connection,
  supervisorId,
  fromDate,
  toDate,
  settings,
) {
  const [students] = await connection.query(
    `
    SELECT DISTINCT s.id, s.name, c.name AS committeeName
    FROM students s
    JOIN committees c ON c.id = s.committee_id
    JOIN supervisor_committees sc ON sc.committee_id = s.committee_id
    WHERE sc.supervisor_id = ?
    ORDER BY c.name ASC, s.name ASC
    `,
    [supervisorId]
  );
  const dates = fromDate <= toDate ? getDatesInRange(fromDate, toDate) : [];
  for (const student of students) {
    const plan = await getActivePlanForStudent(connection, student.id);
    if (!plan) continue;
    for (const date of dates) {
      await ensureStudentPlanTasks(connection, plan, date, settings);
      await ensureRepeatTasksForMemorizationDate(connection, plan, date);
    }
    if (settings.allowQuranCompensation) {
      const memorization = await getMemorizationCompensationState(connection, plan, toDate, settings);
      const link = await getLinkCompensationState(connection, plan, toDate, settings);
      const review = await getReviewCompensationState(connection, plan, toDate, settings);
      student.hasCompensation = Boolean(memorization.items.length || memorization.pending || link.owed || link.pending || review.owed);
    }
  }
  return students;
}

function isOwnRecitationAccount(req, accountId) {
  return ['supervisor', 'reciter'].includes(req.auth?.role)
    && Number(req.auth?.id) === Number(accountId);
}

app.get('/api/supervisors/:id/quran-evaluation', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const supervisorId = Number(req.params.id || 0);
    if (!isOwnRecitationAccount(req, supervisorId)) {
      return res.status(403).json({ message: 'جلسات التسميع متاحة لصاحب الحساب فقط.' });
    }
    const now = getSaudiDateTimeParts();
    const settings = await loadSettings();
    const recitationPreferences = await loadStaffRecitationPreferences(
      connection,
      supervisorId,
      req.auth.role,
      settings,
    );
    const requestedDate = isValidDateOnly(req.query.date || now.date) ? String(req.query.date || now.date) : now.date;
    const {
      sessionDate: date,
      previousSessionDate,
      generationEndDate,
    } = getRecitationEvaluationWindow(requestedDate, settings, now.date);
    const teacherAttendanceMode = canTeacherSetRecitationAttendance(settings, req.auth.role);
    if (!isRecitationSessionDay(requestedDate, settings)) {
      // A day without a session can still be a self-reading day: the teacher records only the reading.
      const reading = await loadTeacherReading(connection, { supervisorId, date: requestedDate });
      return res.json({
        date: reading.readingDay ? requestedDate : date,
        previousSessionDate,
        generationEndDate,
        quranTaskExecutionSource: getQuranTaskExecutionSource(settings, 'memorization'),
        recitationAttendanceSource: settings.recitationAttendanceSource,
        readingOnly: reading.readingDay,
        reading: reading.students,
        students: reading.students.map((student) => ({
          studentId: student.studentId,
          studentName: student.studentName,
          committeeName: student.committeeName,
          attendanceStatus: '',
          canSetAttendance: false,
          readingOnly: true,
        })),
        recitationSessionDays: settings.recitationSessionDays,
        evaluationModes: Object.fromEntries(['memorization', 'mastery', 'review', 'link'].map((type) => [
          type,
          getRecitationEvaluationMode(settings, {
            taskType: type === 'mastery' ? 'memorization' : type,
            track: type === 'mastery' ? 'mastery' : 'memorization',
          }, req.auth.role, recitationPreferences),
        ])),
        tasks: [],
      });
    }
    const students = await ensureSupervisorTeacherModeTasks(
      connection,
      supervisorId,
      addUtcDays(previousSessionDate, 1),
      generationEndDate,
      settings,
    );
    const attendanceSnapshotAt = Date.now();
    const [attendanceRows] = await connection.query(
      `
      SELECT student_id AS studentId, status
      FROM attendance_records
      WHERE record_date = ?
        AND student_id IN (
          SELECT s.id
          FROM students s
          JOIN supervisor_committees sc ON sc.committee_id = s.committee_id
          WHERE sc.supervisor_id = ?
        )
      `,
      [date, supervisorId]
    );
    const attendanceByStudent = new Map(attendanceRows.map((row) => [Number(row.studentId), row.status]));
    const reading = await loadTeacherReading(connection, { supervisorId, date });
    const readingStudentIds = new Set(reading.students.map((student) => student.studentId));
    const taskEndDate = generationEndDate;
    const studentExecutedMemorizationCondition = getQuranTaskExecutionSource(settings, 'memorization') === 'student'
      ? `(t.task_type = 'memorization' AND t.student_status = 'done' AND t.execution_actor_role = 'student')`
      : 'FALSE';
    const retryableAttemptFilter = `EXISTS (
      SELECT 1
      FROM student_quran_recitation_attempts previous_attempt
      WHERE previous_attempt.task_id = t.id
        AND previous_attempt.is_official = 1
        AND previous_attempt.session_date = (
          SELECT MAX(latest_attempt.session_date)
          FROM student_quran_recitation_attempts latest_attempt
          JOIN student_quran_tasks latest_task ON latest_task.id = latest_attempt.task_id
          WHERE latest_task.student_id = t.student_id
            AND latest_attempt.is_official = 1
        )
    )`;
    const [candidateRows] = await connection.query(
      `
      SELECT
        t.id,
        t.plan_id AS planId,
        t.student_id AS studentId,
        s.name AS studentName,
        c.name AS committeeName,
        DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
        t.task_type AS taskType,
        t.track AS track,
        t.compensation_index AS compensationIndex,
        t.from_page AS fromPage,
        t.to_page AS toPage,
        t.from_surah AS fromSurah,
        t.from_ayah AS fromAyah,
        t.to_surah AS toSurah,
        t.to_ayah AS toAyah,
        qsf.name_arabic AS fromSurahName,
        qst.name_arabic AS toSurahName,
        t.target_pages AS targetPages,
        t.review_execution_json AS reviewExecution,
        t.normal_to_page AS normalToPage,
        t.normal_to_surah AS normalToSurah,
        t.normal_to_ayah AS normalToAyah,
        t.scheduled_to_page AS scheduledToPage,
        t.scheduled_to_surah AS scheduledToSurah,
        t.scheduled_to_ayah AS scheduledToAyah,
        t.actual_to_page AS actualToPage,
        t.actual_to_surah AS actualToSurah,
        t.actual_to_ayah AS actualToAyah,
        t.execution_state AS executionState,
        t.student_status AS studentStatus,
        t.execution_actor_role AS executionActorRole,
        t.teacher_rating_key AS teacherRatingKey,
        t.teacher_rating_label AS teacherRatingLabel,
        t.warning_count AS warningCount,
        t.mistake_count AS mistakeCount,
        t.evaluation_score AS evaluationScore,
        t.points,
        t.teacher_completed AS teacherCompleted,
        DATE_FORMAT(t.evaluated_at, '%Y-%m-%d %H:%i') AS evaluatedAt,
        p.track AS planTrack, p.start_page AS planStartPage,
        p.start_surah AS planStartSurah,
        qps.name_arabic AS planStartSurahName,
        p.start_ayah AS planStartAyah,
        p.end_page AS planEndPage,
        p.end_surah AS planEndSurah,
        qpe.name_arabic AS planEndSurahName,
        p.end_ayah AS planEndAyah,
        p.daily_pages AS planDailyPages,
        p.link_pages AS planLinkPages,
        DATE_FORMAT(p.start_date, '%Y-%m-%d') AS planStartDate,
        DATE_FORMAT(p.effective_from, '%Y-%m-%d') AS planEffectiveFrom,
        p.schedule_days_json AS planScheduleDays,
        p.schedule_anchor_page AS planScheduleAnchorPage,
        p.schedule_anchor_surah AS planScheduleAnchorSurah,
        p.schedule_anchor_ayah AS planScheduleAnchorAyah,
        (
          SELECT repeat_task.actual_repeat_count
          FROM student_quran_tasks repeat_task
          WHERE repeat_task.plan_id = t.plan_id
            AND repeat_task.task_date = t.task_date
            AND repeat_task.task_type = 'repeat' AND repeat_task.track = t.track
          ORDER BY repeat_task.id DESC
          LIMIT 1
        ) AS actualRepeatCount,
        (
          SELECT repeat_task.actual_listening_count
          FROM student_quran_tasks repeat_task
          WHERE repeat_task.plan_id = t.plan_id
            AND repeat_task.task_date = t.task_date
            AND repeat_task.task_type = 'repeat' AND repeat_task.track = t.track
          ORDER BY repeat_task.id DESC
          LIMIT 1
        ) AS actualListeningCount,
        (
          SELECT repeat_task.execution_actor_role
          FROM student_quran_tasks repeat_task
          WHERE repeat_task.plan_id = t.plan_id
            AND repeat_task.task_date = t.task_date
            AND repeat_task.task_type = 'repeat' AND repeat_task.track = t.track
          ORDER BY repeat_task.id DESC
          LIMIT 1
        ) AS repeatExecutionActorRole,
        (
          SELECT COUNT(*)
          FROM student_quran_recitation_attempts a
          WHERE a.task_id = t.id AND a.is_official = 1
        ) AS attemptCount,
        (
          SELECT COUNT(*)
          FROM student_quran_recitation_attempts a
          WHERE a.task_id = t.id
            AND a.is_official = 1
            AND a.teacher_completed = 1
        ) AS successfulAttemptCount
      FROM student_quran_tasks t
      JOIN student_quran_plans p ON p.id = t.plan_id
      JOIN students s ON s.id = t.student_id
      LEFT JOIN committees c ON c.id = s.committee_id
      LEFT JOIN quran_surahs qsf ON qsf.surah_number = t.from_surah
      LEFT JOIN quran_surahs qst ON qst.surah_number = t.to_surah
      LEFT JOIN quran_surahs qps ON qps.surah_number = p.start_surah
      LEFT JOIN quran_surahs qpe ON qpe.surah_number = p.end_surah
      JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ?
      WHERE (${currentQuranPlanSql('p')} OR ${retryableAttemptFilter} OR ${studentExecutedMemorizationCondition})
        AND t.task_date <= ?
        AND t.task_type IN ('memorization', 'review', 'link')
        AND (
          t.teacher_completed IS NULL
          OR t.teacher_completed = 0
          OR ${retryableAttemptFilter}
        )
        AND NOT EXISTS (
          SELECT 1
          FROM student_quran_recitation_attempts same_day_attempt
          JOIN student_quran_tasks attempted_task ON attempted_task.id = same_day_attempt.task_id
          WHERE attempted_task.plan_id = t.plan_id
            AND attempted_task.task_type = t.task_type
            AND (t.task_type <> 'link' OR attempted_task.task_date = t.task_date)
            AND attempted_task.track = t.track
            AND attempted_task.compensation_index = t.compensation_index
            AND attempted_task.from_page = t.from_page
            AND attempted_task.to_page = t.to_page
            AND COALESCE(attempted_task.from_surah, 0) = COALESCE(t.from_surah, 0)
            AND COALESCE(attempted_task.from_ayah, 0) = COALESCE(t.from_ayah, 0)
            AND COALESCE(attempted_task.to_surah, 0) = COALESCE(t.to_surah, 0)
            AND COALESCE(attempted_task.to_ayah, 0) = COALESCE(t.to_ayah, 0)
            AND same_day_attempt.is_official = 1
            AND same_day_attempt.session_date = ?
        )
        AND NOT EXISTS (
          SELECT 1
          FROM student_quran_tasks newer
          WHERE newer.plan_id = t.plan_id
            AND newer.task_date <= ?
            AND newer.task_date > t.task_date
            AND newer.task_type = t.task_type
            AND t.task_type <> 'link'
            AND newer.track = t.track
            AND newer.from_page = t.from_page
            AND newer.to_page = t.to_page
            AND COALESCE(newer.from_surah, 0) = COALESCE(t.from_surah, 0)
            AND COALESCE(newer.from_ayah, 0) = COALESCE(t.from_ayah, 0)
            AND COALESCE(newer.to_surah, 0) = COALESCE(t.to_surah, 0)
            AND COALESCE(newer.to_ayah, 0) = COALESCE(t.to_ayah, 0)
        )
        AND (t.compensation_index = 0 OR t.task_date = '${date}')
        ${settings.allowQuranCompensation ? `AND (
          -- With compensation on, missed review days are added to the newest review.
          t.task_type <> 'review'
          OR NOT EXISTS (
            SELECT 1 FROM student_quran_tasks newer_review
            WHERE newer_review.plan_id = t.plan_id
              AND newer_review.task_type = 'review'
              AND newer_review.compensation_index = 0
              AND newer_review.task_date > t.task_date
              AND newer_review.task_date <= '${taskEndDate}'
          )
        )` : ''}
        AND (
          -- A later day's link supersedes an unevaluated older one: the link always
          -- ends at the latest memorization, so only the newest link is recited.
          t.task_type <> 'link'
          OR NOT EXISTS (
            SELECT 1
            FROM student_quran_tasks newer_link
            WHERE newer_link.plan_id = t.plan_id
              AND newer_link.task_type = 'link'
              AND newer_link.compensation_index = 0
              AND newer_link.track = t.track
              AND newer_link.task_date > t.task_date
              AND newer_link.task_date <= ?
          )
        )
      ORDER BY c.name ASC, s.name ASC, t.task_date ASC, t.from_page ASC
      `,
      [supervisorId, taskEndDate, date, taskEndDate, taskEndDate]
    );
    const visibleStudentIds = new Set(students.map(student => Number(student.id)));
    const rows = candidateRows.filter((row) => {
      if (!visibleStudentIds.has(Number(row.studentId))) return false;
      if (!canTeacherExecuteQuranTask(settings, row.taskType)) return false;
      return getQuranTaskExecutionSource(settings, 'memorization') !== 'student'
        || row.taskType !== 'memorization'
        || (row.studentStatus === 'done' && row.executionActorRole === 'student');
    });
    const [sessionAttemptRows] = await connection.query(
      `SELECT DISTINCT task.student_id AS studentId
       FROM student_quran_recitation_attempts attempt
       JOIN student_quran_tasks task ON task.id = attempt.task_id
       JOIN students student ON student.id = task.student_id
       JOIN supervisor_committees sc ON sc.committee_id = student.committee_id
       WHERE sc.supervisor_id = ? AND attempt.is_official = 1
         AND attempt.session_date = ?`,
      [supervisorId, date],
    );
    const attemptedStudentIds = new Set(sessionAttemptRows.map((row) => Number(row.studentId)));
    const activeTaskStudentIds = new Set(rows.map((row) => Number(row.studentId)));
    const marksByTask = await getQuranTaskDisplayMarks(connection, rows.map((row) => row.id));
    const executionOptionsByGroup = new Map();
    await buildTeacherExecutionChoices(rows, executionOptionsByGroup, connection, date, settings);
    const serializeEvaluationTask = (row) => {
      const _resolveExpectedRepeatCount = () => {
        if (row.track === 'mastery') {
          return settings.masteryRepeatCount;
        }
        return settings.memorizationRepeatCount;
      };
      const _resolveExpectedListeningCount = () => {
        if (row.taskType === 'memorization') {
          return normalizeRepeatCount(row.track === 'mastery' ? settings.masteryListeningCount : settings.memorizationListeningCount, 3);
        }
        return 0;
      };
      return ({
        ...normalizeTaskRow(row, settings.quranReferenceMode),
        allowQuranCompensation: Boolean(settings.allowQuranCompensation),
        allowQuranExtra: Boolean(settings.allowQuranExtra),
        expectedRepeatCount: row.taskType === 'memorization'
          ? normalizeRepeatCount(_resolveExpectedRepeatCount(), 1)
          : 0,
        expectedListeningCount: _resolveExpectedListeningCount(),
        planDirection: getQuranRangeDirection(
          { page: Number(row.planStartPage), surah: Number(row.planStartSurah), ayah: Number(row.planStartAyah) },
          { page: Number(row.planEndPage), surah: Number(row.planEndSurah), ayah: Number(row.planEndAyah) },
        ),
        ...(executionOptionsByGroup.get(`${row.planId}:${row.taskDate}:${row.taskType}:${row.track}:${Number(row.compensationIndex || 0)}`)),
        ayahMarkCount: new Set((marksByTask.get(Number(row.id)) || []).map(quranTaskMarkVerseKey)).size,
        ayahMarks: marksByTask.get(Number(row.id)) || [],
      });
    };
    res.json({
      date,
      previousSessionDate,
      deliveryReceipts: await loadRecitationDeliveryReceipts(connection, supervisorId, date),
      attendanceSnapshotAt,
      generationEndDate,
      quranTaskExecutionSource: getQuranTaskExecutionSource(settings, 'memorization'),
      executionSources: {
        memorization: getQuranTaskExecutionSource(settings, 'memorization'),
        review: getQuranTaskExecutionSource(settings, 'review'),
        link: getQuranTaskExecutionSource(settings, 'link'),
        repeat: getQuranTaskExecutionSource(settings, 'repeat'),
      },
      recitationAttendanceSource: settings.recitationAttendanceSource,
      allowRepeatCountEditing: canTeacherExecuteQuranTask(settings, 'repeat'),
      listeningEnabled: true,
      allowListeningCountEditing: canTeacherExecuteQuranTask(settings, 'repeat'),
      allowQuranCompensation: Boolean(settings.allowQuranCompensation),
      allowQuranExtra: Boolean(settings.allowQuranExtra),
      reading: reading.students,
      students: students
        .filter((student) => {
          const attendanceStatus = attendanceByStudent.get(Number(student.id)) || '';
          if (readingStudentIds.has(Number(student.id))) return true;
          if (['absent', 'excused'].includes(attendanceStatus)) return false;
          if (!['present', 'late'].includes(attendanceStatus)) return teacherAttendanceMode;
          return activeTaskStudentIds.has(Number(student.id))
            || attemptedStudentIds.has(Number(student.id))
            || readingStudentIds.has(Number(student.id));
        })
        .map((student) => ({
          studentId: student.id,
          studentName: student.name,
          committeeName: student.committeeName,
          attendanceStatus: attendanceByStudent.get(Number(student.id)) || '',
          canSetAttendance: teacherAttendanceMode,
          hasCompensation: Boolean(student.hasCompensation),
          recitationFinished: attemptedStudentIds.has(Number(student.id))
            && !activeTaskStudentIds.has(Number(student.id)),
        })),
      gradingPolicy: await loadGradingPolicyForDate(db(), date, { freeze: false }),
      evaluationModes: Object.fromEntries(['memorization', 'mastery', 'review', 'link'].map((type) => [
        type,
        getRecitationEvaluationMode(settings, {
          taskType: type === 'mastery' ? 'memorization' : type,
          track: type === 'mastery' ? 'mastery' : 'memorization',
        }, req.auth.role, recitationPreferences),
      ])),
      recitationSessionDays: settings.recitationSessionDays,
      tasks: rows
        .filter((row) => isRecitationAttendanceVisible(attendanceByStudent.get(Number(row.studentId)) || '', teacherAttendanceMode))
        .map(serializeEvaluationTask),
      taskQueue: rows
        .filter((row) => isRecitationAttendanceVisible(attendanceByStudent.get(Number(row.studentId)) || '', teacherAttendanceMode))
        .map(serializeEvaluationTask),
    });
  } catch (error) {
    next(error);
  } finally {
    connection.release();
  }
});

/** The teacher records a student's self reading for the day: read (with the faces) or not read. */
app.put('/api/supervisors/:id/quran-evaluation/reading', async (req, res, next) => {
  try {
    const supervisorId = Number(req.params.id || 0);
    if (!isOwnRecitationAccount(req, supervisorId)) {
      return res.status(403).json({ message: 'جلسات التسميع متاحة لصاحب الحساب فقط.' });
    }
    const studentId = Number(req.body?.studentId || 0);
    const date = String(req.body?.date || '');
    const completed = req.body?.completed === null ? null : req.body?.completed === true;
    if (!Number.isInteger(studentId) || studentId <= 0 || !isValidDateOnly(date)) {
      return res.status(422).json({ message: 'بيانات القراءة الذاتية غير صحيحة.' });
    }
    if (date > getSaudiDateTimeParts().date) {
      return res.status(422).json({ message: 'لا يمكن تسجيل القراءة لتاريخ لم يأتِ بعد.' });
    }
    const reading = await saveTeacherReading(db(), {
      supervisorId,
      studentId,
      date,
      completed,
      faces: req.body?.faces,
      actor: { role: req.auth.role, id: req.auth.id, name: req.auth.name },
    });
    if (!reading) return res.status(403).json({ message: 'لا يمكنك تسجيل قراءة طالب خارج حلقاتك.' });
    return res.json({ ok: true, reading });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

app.post('/api/supervisors/:id/quran-evaluation/:taskId/range', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const supervisorId = Number(req.params.id || 0);
    const taskId = Number(req.params.taskId || 0);
    if (!isOwnRecitationAccount(req, supervisorId)) {
      return res.status(403).json({ message: 'جلسات التسميع متاحة لصاحب الحساب فقط.' });
    }
    const settings = await loadSettings();
    const now = getSaudiDateTimeParts();
    const requestedDate = isValidDateOnly(req.body.date || now.date) ? String(req.body.date || now.date) : now.date;
    if (!isRecitationSessionDay(requestedDate, settings)) {
      return res.status(422).json({ message: 'تعديل المقدار متاح في أيام جلسات التسميع فقط.' });
    }
    const { sessionDate: executionDate, generationEndDate } = getRecitationEvaluationWindow(requestedDate, settings, now.date);
    await connection.beginTransaction();
    const [[anchor]] = await connection.query(
      `SELECT
        t.id, t.plan_id AS planId, t.student_id AS studentId,
        DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate, t.task_type AS taskType, t.track,
        t.from_page AS fromPage, t.from_surah AS fromSurah, t.from_ayah AS fromAyah,
        t.to_page AS toPage, t.to_surah AS toSurah, t.to_ayah AS toAyah,
        p.track AS planTrack, p.start_page AS startPage, p.start_surah AS startSurah, p.start_ayah AS startAyah,
        p.end_page AS endPage, p.end_surah AS endSurah, p.end_ayah AS endAyah,
        p.daily_pages AS dailyPages, DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(p.effective_from, '%Y-%m-%d') AS effectiveFrom,
        p.schedule_days_json AS scheduleDays,
        p.schedule_anchor_page AS scheduleAnchorPage,
        p.schedule_anchor_surah AS scheduleAnchorSurah,
        p.schedule_anchor_ayah AS scheduleAnchorAyah
       FROM student_quran_tasks t
       JOIN student_quran_plans p ON p.id = t.plan_id
       JOIN students s ON s.id = t.student_id
       JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ?
       WHERE t.id = ? AND t.task_type IN ('memorization','review') AND t.task_date <= ?
         AND t.compensation_index = 0
         AND EXISTS (
           SELECT 1 FROM attendance_records attendance
           WHERE attendance.student_id = t.student_id
             AND attendance.record_date = ?
             AND attendance.status IN ('present', 'late')
         )
       LIMIT 1 FOR UPDATE`,
      [supervisorId, taskId, generationEndDate, executionDate],
    );
    if (!anchor) {
      await connection.rollback();
      return res.status(404).json({ message: 'مهمة التسميع غير موجودة.' });
    }
    const plan = { ...anchor, id: anchor.planId };
    const direction = getRecitationRangeDirection(anchor, plan);
    const { taskScopeSql, taskScopeParams } = buildRequestedRecitationTaskScope(req, taskId, anchor);
    let [tasks] = await connection.query(
      `SELECT id, plan_id AS planId, student_id AS studentId, DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate,
        task_type AS taskType, track, from_page AS fromPage, to_page AS toPage,
        from_surah AS fromSurah, from_ayah AS fromAyah, to_surah AS toSurah, to_ayah AS toAyah,
        target_pages AS targetPages
       FROM student_quran_tasks
       WHERE plan_id = ? AND student_id = ? AND ${taskScopeSql} AND task_type = ? AND track = ?
         AND compensation_index = 0
         AND NOT EXISTS (
           SELECT 1
           FROM student_quran_tasks newer
           WHERE newer.plan_id = student_quran_tasks.plan_id
             AND newer.task_date <= ?
             AND newer.task_date > student_quran_tasks.task_date
             AND newer.task_type = student_quran_tasks.task_type
             AND newer.track = student_quran_tasks.track
             AND newer.from_page = student_quran_tasks.from_page
             AND newer.to_page = student_quran_tasks.to_page
             AND COALESCE(newer.from_surah, 0) = COALESCE(student_quran_tasks.from_surah, 0)
             AND COALESCE(newer.from_ayah, 0) = COALESCE(student_quran_tasks.from_ayah, 0)
             AND COALESCE(newer.to_surah, 0) = COALESCE(student_quran_tasks.to_surah, 0)
             AND COALESCE(newer.to_ayah, 0) = COALESCE(student_quran_tasks.to_ayah, 0)
         )
       ORDER BY id ASC FOR UPDATE`,
      [plan.id, anchor.studentId, ...taskScopeParams, anchor.taskType, anchor.track, generationEndDate],
    );
    if (!tasks.some((task) => Number(task.id) === taskId)) {
      await connection.rollback();
      return res.status(422).json({ message: 'مقاطع التسميع المحددة غير صالحة.' });
    }
    tasks = tasks.sort((first, second) => compareQuranPositionInDirection(taskStartPosition(first), taskStartPosition(second), direction));
    if (anchor.taskType !== 'memorization') {
      await connection.rollback();
      return res.status(422).json({ message: 'تعديل المقدار متاح للحفظ فقط.' });
    }
    const actualStart = taskStartPosition(tasks[0]);
    const context = await getPlanProgressContext(connection, plan, executionDate, settings, actualStart);
    const actualEnd = await resolveExecutionEndPosition(connection, req.body.actualEnd, context?.normalEnd, direction);
    if (!context || !actualEnd
      || compareQuranPositionInDirection(actualEnd, actualStart, direction) < 0
      || compareQuranPositionInDirection(actualEnd, context.allowedEnd, direction) > 0) {
      await connection.rollback();
      return res.status(422).json({ message: 'نهاية التسميع خارج الحد المسموح.' });
    }
    await buildExecutionSegmentDetails(connection, context, actualEnd, settings);

    const currentEnd = taskEndPosition(tasks.at(-1));
    tasks = await extendRecitationTaskRange({ actualEnd, currentEnd, direction, tasks, connection, context, plan, anchor, generationEndDate, actualStart });

    await persistLocalRecitationRange(tasks, actualEnd, direction, context, connection);
    await connection.commit();
    const selectedIds = tasks
      .filter((task) => compareQuranPositionInDirection(actualEnd, taskStartPosition(task), direction) >= 0)
      .map((task) => Number(task.id));
    res.json({ ok: true, taskIds: selectedIds, actualEnd });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/supervisors/:id/quran-evaluation/:taskId/ayahs', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const supervisorId = Number(req.params.id || 0);
    const taskId = Number(req.params.taskId || 0);
    if (!isOwnRecitationAccount(req, supervisorId)) {
      return res.status(403).json({ message: 'جلسات التسميع متاحة لصاحب الحساب فقط.' });
    }
    const settings = await loadSettings();
    const [[task]] = await connection.query(
      `
      SELECT
        t.id,
        t.task_type AS taskType,
        t.from_page AS fromPage,
        t.to_page AS toPage,
        t.from_surah AS fromSurah,
        t.from_ayah AS fromAyah,
        t.to_surah AS toSurah,
        t.to_ayah AS toAyah,
        t.review_execution_json AS reviewExecution,
        t.actual_to_page AS actualToPage,
        t.actual_to_surah AS actualToSurah,
        t.actual_to_ayah AS actualToAyah
      FROM student_quran_tasks t
      JOIN students s ON s.id = t.student_id
      JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ?
      WHERE t.id = ? AND t.task_type IN ('memorization', 'review', 'link')
      LIMIT 1
      `,
      [supervisorId, taskId]
    );
    if (!task || !canTeacherExecuteQuranTask(settings, task.taskType)) {
      return res.status(404).json({ message: 'المهمة غير موجودة ضمن جلسات هذا المعلم.' });
    }
    const ayahs = await getQuranAyahsForTask(connection, task);
    const marksByTask = await getQuranTaskAyahMarks(connection, [taskId]);
    const wordMarksByTask = await getQuranTaskWordMarks(connection, [taskId]);
    const allowedVerseKeys = new Set(ayahs.map((ayah) => `${Number(ayah.surah)}:${Number(ayah.ayah)}`));
    const marks = (marksByTask.get(taskId) || []).filter((mark) => allowedVerseKeys.has(`${Number(mark.surah)}:${Number(mark.ayah)}`));
    const wordMarks = (wordMarksByTask.get(taskId) || []).filter((mark) => (
      allowedVerseKeys.has(`${Number(mark.startSurah)}:${Number(mark.startAyah)}`)
      && allowedVerseKeys.has(`${Number(mark.endSurah)}:${Number(mark.endAyah)}`)
    ));
    const taskDirection = getQuranRangeDirection(taskStartPosition(task), {
      page: Number(task.actualToPage || task.toPage),
      surah: Number(task.actualToSurah || task.toSurah),
      ayah: Number(task.actualToAyah || task.toAyah),
    });
    const pageNumbers = await getQcfTaskPageNumbers(task);
    const pages = await Promise.all(pageNumbers.map((page) => getQcfMushafPage(page)));
    res.json({
      ayahs,
      marks,
      wordMarks,
      pages,
      allowedRange: {
        fromSurah: Number(task.fromSurah),
        fromAyah: Number(task.fromAyah),
        toSurah: Number(task.actualToSurah || task.toSurah),
        toAyah: Number(task.actualToAyah || task.toAyah),
        direction: taskDirection,
      },
    });
  } catch (error) {
    next(error);
  } finally {
    connection.release();
  }
});

const rateSupervisorQuranTaskHandler = async (req, res, next) => {
  const connection = req.recitationConnection || await db().getConnection();
  try {
    const supervisorId = Number(req.params.id || 0);
    const taskId = Number(req.params.taskId || 0);
    if (!isOwnRecitationAccount(req, supervisorId)) {
      return res.status(403).json({ message: 'جلسات التسميع متاحة لصاحب الحساب فقط.' });
    }
    const settings = await loadSettings();
    const recitationPreferences = await loadStaffRecitationPreferences(
      connection,
      supervisorId,
      req.auth.role,
      settings,
    );
    let { warningCount, mistakeCount, notMemorized, requestId, ayahMarksPayload, wordMarksPayload, markLimit } = normalizeRecitationEvaluationInput(req);
    if (!Number.isFinite(warningCount) || !Number.isFinite(mistakeCount)) {
      return res.status(422).json({ message: 'التقييم غير صحيح.' });
    }
    const now = getSaudiDateTimeParts();
    const requestedDate = resolveRecitationRequestDate(req.body.date, now.date);
    if (!isRecitationSessionDay(requestedDate, settings)) {
      return res.status(422).json({ message: 'التقييم متاح في أيام جلسات التسميع فقط.' });
    }
    const {
      sessionDate: date,
      generationEndDate,
    } = getRecitationEvaluationWindow(requestedDate, settings, now.date);
    const taskEndDate = generationEndDate;

    await connection.beginTransaction();
    const [[task]] = await connection.query(
      `
      SELECT
        t.id,
        t.plan_id AS planId,
        t.student_id AS studentId,
        DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
        t.task_type AS taskType,
        t.track AS track,
        t.compensation_index AS compensationIndex,
        t.from_page AS fromPage,
        t.to_page AS toPage,
        t.from_surah AS fromSurah,
        t.from_ayah AS fromAyah,
        t.to_surah AS toSurah,
        t.to_ayah AS toAyah,
        t.review_execution_json AS reviewExecution,
        t.actual_to_page AS actualToPage,
        t.actual_to_surah AS actualToSurah,
        t.actual_to_ayah AS actualToAyah,
        t.target_pages AS targetPages,
        t.normal_to_page AS normalToPage,
        t.normal_to_surah AS normalToSurah,
        t.normal_to_ayah AS normalToAyah,
        t.scheduled_to_page AS scheduledToPage,
        t.scheduled_to_surah AS scheduledToSurah,
        t.scheduled_to_ayah AS scheduledToAyah,
        t.student_status AS studentStatus,
        t.execution_actor_role AS executionActorRole,
        p.track AS planTrack, p.start_page AS startPage,
        p.start_surah AS startSurah,
        p.start_ayah AS startAyah,
        p.end_page AS endPage,
        p.end_surah AS endSurah,
        p.end_ayah AS endAyah,
        p.daily_pages AS dailyPages,
        p.link_pages AS planLinkPages,
        DATE_FORMAT(p.start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(p.effective_from, '%Y-%m-%d') AS effectiveFrom,
        p.schedule_days_json AS scheduleDays,
        p.schedule_anchor_page AS scheduleAnchorPage,
        p.schedule_anchor_surah AS scheduleAnchorSurah,
        p.schedule_anchor_ayah AS scheduleAnchorAyah,
        p.plan_version AS planVersion,
        t.teacher_completed AS previousTeacherCompleted
      FROM student_quran_tasks t
      JOIN student_quran_plans p ON p.id = t.plan_id
      JOIN students s ON s.id = t.student_id
      JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ?
      WHERE t.id = ?
        AND EXISTS (
          SELECT 1
          FROM attendance_records ar
          WHERE ar.student_id = s.id
            AND ar.record_date = ?
            AND ar.status IN ('present', 'late')
        )
        AND t.task_type IN ('memorization', 'review', 'link')
        AND t.task_date <= ?
        AND (
          t.teacher_completed IS NULL
          OR t.teacher_completed = 0
          OR EXISTS (
        SELECT 1 FROM student_quran_recitation_attempts previous_attempt
            WHERE previous_attempt.task_id = t.id
              AND previous_attempt.is_official = 1
              AND previous_attempt.teacher_completed = 1
          )
        )
        AND NOT EXISTS (
          SELECT 1
          FROM student_quran_tasks newer
          WHERE newer.plan_id = t.plan_id
            AND newer.task_date <= ?
            AND newer.task_date > t.task_date
            AND newer.task_type = t.task_type
            AND newer.track = t.track
            AND newer.from_page = t.from_page
            AND newer.to_page = t.to_page
            AND COALESCE(newer.from_surah, 0) = COALESCE(t.from_surah, 0)
            AND COALESCE(newer.from_ayah, 0) = COALESCE(t.from_ayah, 0)
            AND COALESCE(newer.to_surah, 0) = COALESCE(t.to_surah, 0)
            AND COALESCE(newer.to_ayah, 0) = COALESCE(t.to_ayah, 0)
        )
      FOR UPDATE
      `,
      [supervisorId, taskId, date, taskEndDate, taskEndDate]
    );
    const rejectInvalidRecitationTaskResult = await rejectInvalidRecitationTask({ task, settings, connection, res, notMemorized });
    if (rejectInvalidRecitationTaskResult) { return rejectInvalidRecitationTaskResult; }
    if (notMemorized) {
      warningCount = 0;
      mistakeCount = 0;
    }
    const teacherExecutionMode = task.studentStatus !== 'done';
    // A plan edit must not rewrite or reject recitation that already happened offline.
    // claimRecitationSession stores both the submitted snapshot version and the current version.
    const sessionClaim = await claimRecitationSession(connection, {
      req,
      task,
      sessionDate: date,
      requestId,
    });
    const replyToRejectedRecitationClaimResult = await replyToRejectedRecitationClaim({ sessionClaim, connection, res });
    if (replyToRejectedRecitationClaimResult) { return replyToRejectedRecitationClaimResult; }

    const evaluationMode = getRecitationEvaluationMode(
      settings,
      task,
      req.auth.role,
      recitationPreferences,
    );
    const requestedEvaluationMode = ['mushaf', 'count'].includes(req.body.evaluationMode)
      ? req.body.evaluationMode
      : null;
    const rejectInvalidRecitationModeResult = await rejectInvalidRecitationMode({ requestedEvaluationMode, evaluationMode, connection, res, ayahMarksPayload, wordMarksPayload, notMemorized });
    if (rejectInvalidRecitationModeResult) { return rejectInvalidRecitationModeResult; }
    const replyToExistingRecitationAttemptResult = await replyToExistingRecitationAttempt({ requestId, connection, taskId, res });
    if (replyToExistingRecitationAttemptResult) { return replyToExistingRecitationAttemptResult; }
    let normalizedAyahMarks = null;
    let normalizedWordMarks = null;
    ({ mistakeCount, warningCount } = await saveValidatedRecitationMarks({ ayahMarksPayload, wordMarksPayload, connection, task, normalizedWordMarks, markLimit, normalizedAyahMarks, mistakeCount, warningCount, taskId, supervisorId }));
    const { ratingLabel, score, policy, completed: rowCompleted, evaluatedFaces } = await calculateTaskEvaluationOutcome({ task, connection, notMemorized, warningCount, mistakeCount });
    let completed = rowCompleted;
    await connection.query(
      `
      UPDATE student_quran_tasks
      SET teacher_rating_key = ?,
          teacher_rating_label = ?,
          warning_count = ?,
          mistake_count = ?,
          evaluation_score = ?,
          evaluation_max_score = ?,
          evaluation_warning_deduction = ?,
          evaluation_mistake_deduction = ?,
          evaluation_passing_score = ?,
          teacher_completed = ?,
          student_status = CASE WHEN ? THEN 'done' ELSE student_status END,
          actual_to_page = CASE WHEN ? THEN COALESCE(actual_to_page, to_page) ELSE actual_to_page END,
          actual_to_surah = CASE WHEN ? THEN COALESCE(actual_to_surah, to_surah) ELSE actual_to_surah END,
          actual_to_ayah = CASE WHEN ? THEN COALESCE(actual_to_ayah, to_ayah) ELSE actual_to_ayah END,
          execution_state = CASE WHEN ? THEN COALESCE(execution_state, 'complete') ELSE execution_state END,
          execution_actor_role = CASE WHEN ? AND execution_actor_role IS NULL THEN 'teacher' ELSE execution_actor_role END,
          execution_actor_id = CASE WHEN ? AND execution_actor_id IS NULL THEN ? ELSE execution_actor_id END,
          executed_at = CASE WHEN ? AND executed_at IS NULL THEN NOW(3) ELSE executed_at END,
          evaluated_by = ?,
          evaluated_at = NOW()
      WHERE id = ?
      `,
      [
        notMemorized ? MANUAL_FAIL_RATING_KEY : 'score',
        ratingLabel,
        warningCount,
        mistakeCount,
        score,
        policy.maxScore,
        policy.warningDeduction,
        policy.mistakeDeduction,
        policy.passingScore,
        completed ? 1 : 0,
        teacherExecutionMode,
        teacherExecutionMode,
        teacherExecutionMode,
        teacherExecutionMode,
        teacherExecutionMode,
        teacherExecutionMode,
        teacherExecutionMode,
        supervisorId,
        teacherExecutionMode,
        supervisorId,
        taskId,
      ]
    );
    await saveTeacherExecutedRepetitions({ notMemorized, teacherExecutionMode, task, settings, req, connection, supervisorId });
    const [[attemptSequence]] = await connection.query(
      'SELECT COALESCE(MAX(attempt_number), 0) + 1 AS attemptNumber FROM student_quran_recitation_attempts WHERE task_id = ?',
      [taskId]
    );
    const attemptNumber = Number(attemptSequence.attemptNumber || 1);
    const attemptMarksByTask = await getQuranTaskDisplayMarks(connection, [taskId]);
    const attemptWordMarksByTask = await getQuranTaskWordMarks(connection, [taskId]);
    const [attemptResult] = await connection.query(
      `
      INSERT INTO student_quran_recitation_attempts
        (
          task_id, student_id, evaluator_id, session_date, attempt_number, request_id, session_id, is_official,
          warning_count, mistake_count, evaluation_score, evaluation_max_score,
          evaluation_warning_deduction, evaluation_mistake_deduction,
          evaluation_passing_score, teacher_completed, ayah_marks_json, word_marks_json
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        taskId,
        task.studentId,
        supervisorId,
        date,
        attemptNumber,
        requestId,
        sessionClaim.sessionId,
        warningCount,
        mistakeCount,
        score,
        policy.maxScore,
        policy.warningDeduction,
        policy.mistakeDeduction,
        policy.passingScore,
        completed ? 1 : 0,
        JSON.stringify(attemptMarksByTask.get(taskId) || []),
        JSON.stringify(attemptWordMarksByTask.get(taskId) || []),
      ]
    );
    const groupGrade = await applyRecitationGroupGrade({ task, connection, req, supervisorId });
    if (groupGrade?.failed && completed) {
      completed = false;
      await connection.query(
        'UPDATE student_quran_recitation_attempts SET teacher_completed = 0 WHERE id = ?',
        [attemptResult.insertId],
      );
    }
    await applyMemorizationEvaluationOutcome({
      task: groupGrade?.failed && task.taskType === 'memorization' ? await getFirstGroupMemorizationTask(connection, task) : task,
      completed,
      connection,
      date,
      req,
      settings,
    });
    {
      const [groupTasks] = await connection.query(
        `SELECT id, evaluated_at AS evaluatedAt, teacher_completed AS teacherCompleted,
          from_page AS fromPage, from_surah AS fromSurah, from_ayah AS fromAyah,
          to_page AS toPage, to_surah AS toSurah, to_ayah AS toAyah,
          actual_to_page AS actualToPage, actual_to_surah AS actualToSurah, actual_to_ayah AS actualToAyah
         FROM student_quran_tasks
         WHERE plan_id = ? AND task_date = ? AND task_type = ? AND track = ? AND compensation_index = ?
         FOR UPDATE`,
        [task.planId, task.taskDate, task.taskType, task.track, Number(task.compensationIndex || 0)],
      );
      const groupEvaluated = groupTasks.length > 0 && groupTasks.every((row) => row.evaluatedAt);
      await applyEvaluatedGroupSegments({ groupEvaluated, task, groupTasks, settings, connection, date, attemptResult });
    }
    const recitationResult = {
      warningCount,
      mistakeCount,
      evaluationScore: score,
      evaluationMaxScore: policy.maxScore,
      evaluatedFaces,
      attemptNumber,
      teacherRatingLabel: ratingLabel,
      teacherCompleted: completed,
    };
    await finalizeRecitationTask(connection, {
      claim: sessionClaim,
      req,
      task,
      result: recitationResult,
    });
    await connection.commit();
    const savedMarksByTask = await getQuranTaskAyahMarks(connection, [taskId]);
    const savedAyahMarks = savedMarksByTask.get(taskId) || [];
    const savedWordMarksByTask = await getQuranTaskWordMarks(connection, [taskId]);
    res.json({
      ok: true,
      warningCount,
      mistakeCount,
      evaluationScore: score,
      evaluationMaxScore: policy.maxScore,
      evaluatedFaces,
      attemptNumber,
      teacherRatingLabel: ratingLabel,
      teacherCompleted: completed,
      ayahMarkCount: new Set(savedAyahMarks.map((mark) => `${mark.surah}:${mark.ayah}`)).size,
      ayahMarks: savedAyahMarks,
      wordMarks: savedWordMarksByTask.get(taskId) || [],
      sessionId: sessionClaim.sessionId,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
};

app.post('/api/supervisors/:id/quran-evaluation/:taskId', rateSupervisorQuranTaskHandler);

async function loadSurahNames(connection) {
  const [rows] = await connection.query('SELECT surah_number AS surah, name_arabic AS name FROM quran_surahs');
  return new Map(rows.map((row) => [Number(row.surah), row.name]));
}

function compensationRangeLabel(range, names) {
  return formatTaskPreview({
    ...range,
    fromSurahName: names.get(Number(range.fromSurah)) || '',
    toSurahName: names.get(Number(range.toSurah)) || '',
  }, 'ayah');
}

/** Resolve the session day and the supervisor's own student for a compensation request. */
async function resolveCompensationRequest(req, connection) {
  const supervisorId = Number(req.params.id || 0);
  if (!isOwnRecitationAccount(req, supervisorId)) {
    return { status: 403, message: 'جلسات التسميع متاحة لصاحب الحساب فقط.' };
  }
  const settings = await loadSettings();
  if (!settings.allowQuranCompensation) return { status: 422, message: 'التعويض غير مفعل في الإعدادات.' };
  const studentId = Number(req.body?.studentId || req.query?.studentId || 0);
  const now = getSaudiDateTimeParts();
  const requestedDate = resolveRecitationRequestDate(req.body?.date || req.query?.date, now.date);
  if (!isRecitationSessionDay(requestedDate, settings)) {
    return { status: 422, message: 'التعويض متاح في أيام جلسات التسميع فقط.' };
  }
  const { sessionDate: date } = getRecitationEvaluationWindow(requestedDate, settings, now.date);
  const [[student]] = await connection.query(
    `SELECT s.id FROM students s
     JOIN supervisor_committees sc ON sc.committee_id = s.committee_id AND sc.supervisor_id = ?
     WHERE s.id = ? LIMIT 1`,
    [supervisorId, studentId],
  );
  if (!student) return { status: 404, message: 'الطالب غير موجود ضمن حلقاتك.' };
  const plan = await getActivePlanForStudent(connection, studentId);
  if (!plan) return { status: 404, message: 'لا توجد خطة نشطة لهذا الطالب.' };
  return { supervisorId, settings, studentId, date, plan };
}

async function buildCompensationSummary(connection, { plan, date, settings }) {
  const names = await loadSurahNames(connection);
  const memorization = await getMemorizationCompensationState(connection, plan, date, settings);
  const link = await getLinkCompensationState(connection, plan, date, settings);
  const review = await getReviewCompensationState(connection, plan, date, settings);
  const pendingIds = (group) => (group ? group.rows.map((row) => Number(row.id)) : []);
  const linkLabel = link.ranges.map((range) => compensationRangeLabel(range, names)).join('، ثم ');
  return {
    date,
    memorization: {
      owed: memorization.items.length + (memorization.pending ? 1 : 0),
      done: memorization.done,
      blocked: memorization.blocked,
      pendingTaskIds: pendingIds(memorization.pending),
      pendingLabel: memorization.pending ? compensationRangeLabel({
        ...memorization.pending.rows[0],
        toPage: memorization.pending.rows.at(-1).toPage,
        toSurah: memorization.pending.rows.at(-1).toSurah,
        toAyah: memorization.pending.rows.at(-1).toAyah,
      }, names) : '',
      items: memorization.items.map((item) => ({ label: compensationRangeLabel(item, names), faces: item.targetPages })),
    },
    link: {
      owed: link.owed,
      done: link.done,
      blocked: link.blocked,
      pendingTaskIds: pendingIds(link.pending),
      label: linkLabel,
    },
    review: {
      owed: review.owed,
      addedDays: review.addedDays,
    },
  };
}

app.get('/api/supervisors/:id/quran-compensations', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const request = await resolveCompensationRequest(req, connection);
    if (request.status) return res.status(request.status).json({ message: request.message });
    res.json(await buildCompensationSummary(connection, request));
  } catch (error) {
    next(error);
  } finally {
    connection.release();
  }
});

/** Create the next compensation recitation as real tasks, so it is recited and evaluated like any amount. */
app.post('/api/supervisors/:id/quran-compensations', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const request = await resolveCompensationRequest(req, connection);
    if (request.status) return res.status(request.status).json({ message: request.message });
    const { settings, studentId, date, plan } = request;
    const taskType = String(req.body?.taskType || '');
    if (!['memorization', 'link'].includes(taskType)) {
      return res.status(422).json({ message: 'نوع التعويض غير صحيح.' });
    }
    const [[present]] = await connection.query(
      "SELECT 1 AS ok FROM attendance_records WHERE student_id = ? AND record_date = ? AND status IN ('present', 'late') LIMIT 1",
      [studentId, date],
    );
    if (!present) return res.status(422).json({ message: 'سجّل حضور الطالب أولاً.' });
    await connection.beginTransaction();
    await connection.query('SELECT id FROM student_quran_plans WHERE id = ? FOR UPDATE', [plan.id]);
    const state = taskType === 'memorization'
      ? await getMemorizationCompensationState(connection, plan, date, settings)
      : await getLinkCompensationState(connection, plan, date, settings);
    if (state.pending) {
      await connection.commit();
      return res.json({ taskIds: state.pending.rows.map((row) => Number(row.id)), existing: true });
    }
    if (state.blocked) {
      await connection.rollback();
      return res.status(409).json({ message: state.blocked });
    }
    const index = state.nextIndex;
    if (taskType === 'memorization') {
      const item = state.items[0];
      if (!item) {
        await connection.rollback();
        return res.status(422).json({ message: 'لا يوجد تعويض حفظ مستحق.' });
      }
      await insertPlanTask(connection, {
        plan, date, type: 'memorization', fromPage: item.fromPage, toPage: item.toPage, targetPages: item.targetPages,
        bounds: { fromSurah: item.fromSurah, fromAyah: item.fromAyah, toSurah: item.toSurah, toAyah: item.toAyah },
        compensationIndex: index,
      });
    } else {
      if (!state.owed) {
        await connection.rollback();
        return res.status(422).json({ message: 'لا يوجد تعويض ربط مستحق.' });
      }
      for (const range of state.ranges) {
        await insertPlanTask(connection, {
          plan: { ...plan, track: range.track }, date, type: 'link', fromPage: range.fromPage, toPage: range.toPage,
          targetPages: range.targetPages,
          bounds: { fromSurah: range.fromSurah, fromAyah: range.fromAyah, toSurah: range.toSurah, toAyah: range.toAyah },
          compensationIndex: index,
        });
      }
    }
    const [created] = await connection.query(
      `SELECT id FROM student_quran_tasks
       WHERE plan_id = ? AND task_date = ? AND task_type = ? AND compensation_index = ? ORDER BY id`,
      [plan.id, date, taskType, index],
    );
    if (!created.length) {
      await connection.rollback();
      return res.status(409).json({ message: 'تعذر تجهيز التعويض، أعد فتح الجلسة.' });
    }
    await connection.commit();
    res.json({ taskIds: created.map((row) => Number(row.id)), existing: false });
  } catch (error) {
    await connection.rollback().catch(() => {});
    next(error);
  } finally {
    connection.release();
  }
});

const runRecitationTaskHandler = async (sourceRequest, params, body, sessionTaskIds = [], connection = null, transaction = null) => {
  let statusCode = 200;
  let result;
  const response = {
    status(value) { statusCode = Number(value) || 500; return this; },
    json(payload) { result = { statusCode, payload }; return this; },
  };
  const request = Object.assign(Object.create(sourceRequest), {
    params, body, recitationSessionTaskIds: sessionTaskIds,
    recitationConnection: connection, recitationTransaction: transaction,
  });
  try {
    await rateSupervisorQuranTaskHandler(request, response, (error) => {
      result = { statusCode: Number(error?.statusCode || 500), error };
    });
  } catch (error) { result = { statusCode: 500, error }; }
  return result || { statusCode: 500 };
};

const batchResultCode = ({ statusCode, payload, error }) => {
  if (statusCode >= 200 && statusCode < 300) return payload?.duplicate ? 'already_synced' : 'accepted';
  if (payload?.code === 'REJECTED_DUPLICATE') return 'rejected_duplicate';
  if (statusCode === 401 || statusCode === 403) return 'rejected_permission';
  if (statusCode >= 500 || error) return 'needs_retry';
  if (statusCode >= 400) return 'conflict';
  return 'server_error';
};

/** Validate the whole batch belongs to one student of this teacher before any evaluation is written. */
async function validateRecitationSessionTasks(connection, session, teacherId) {
  const ids = (session.tasks || []).map(item => Number(item.taskId));
  if (!ids.length || ids.some(id => !Number.isSafeInteger(id) || id <= 0)
    || new Set(ids).size !== ids.length) return false;
  const [owned] = await connection.query(
    `SELECT t.id, t.student_id AS studentId
     FROM student_quran_tasks t
     JOIN students s ON s.id = t.student_id
     WHERE t.id IN (${ids.map(() => '?').join(',')})
       AND EXISTS (SELECT 1 FROM supervisor_committees sc
         WHERE sc.committee_id = s.committee_id AND sc.supervisor_id = ?)`,
    [...ids, teacherId],
  );
  return owned.length === ids.length && owned.every(row => Number(row.studentId) === Number(session.studentId));
}

app.post('/api/offline-recitation/batch', async (req, res) => {
  const sessions = (Array.isArray(req.body.sessions) ? req.body.sessions : [])
    .slice(0, OFFLINE_RECITATION_MAX_BATCH)
    .sort((first, second) => `${first?.sessionDate || ''}:${first?.sessionId || ''}`
      .localeCompare(`${second?.sessionDate || ''}:${second?.sessionId || ''}`));
  const results = [];
  const blockedStudents = new Set();
  for (const session of sessions) {
    const studentId = Number(session?.studentId || 0);
    if (blockedStudents.has(studentId)) {
      results.push({ sessionId: session?.sessionId, result: 'invalid_sequence', tasks: [] });
      continue;
    }
    let taskResults;
    try {
      const outcome = await runRecitationSessionTransaction(db(), async (connection, transaction) => {
        const taskResults = [];
        if (!await validateRecitationSessionTasks(connection, session, Number(req.auth?.id))) {
          transaction.failed = true;
          return [{ taskId: Number(session.tasks?.[0]?.taskId), result: 'invalid_sequence',
            message: 'تغيّرت مقاطع الجلسة. حدّث الجلسة ثم أعد المحاولة.' }];
        }
        for (const item of (Array.isArray(session?.tasks) ? session.tasks : [])) {
          const body = {
            ...(item.payload),
            requestId: `${session.sessionId}:${item.taskId}`,
            sessionId: session.sessionId,
            date: session.sessionDate,
            deviceId: session.deviceId,
            bootId: session.bootId,
            eventMonotonicMs: session.eventMonotonicMs,
            createdAtLocal: session.createdAtLocal,
            committedAtLocal: session.committedAtLocal,
            planVersion: item.planVersion,
            planSnapshot: item.planSnapshot || { planId: item.planId, planVersion: item.planVersion },
          };
          const response = await runRecitationTaskHandler(
            req,
            { id: String(req.auth?.id || 0), taskId: String(item.taskId || 0) },
            body,
            (session.tasks || []).map((sessionTask) => Number(sessionTask.taskId || 0)).filter(Boolean),
            connection, transaction,
          );
          const result = batchResultCode(response);
          taskResults.push({
            taskId: Number(item.taskId || 0),
            result,
            data: response.payload || null,
            message: response.payload?.message || (response.error ? publicErrorMessage(response.error) : ''),
            requestId: req.traceId,
          });
          if (!['accepted', 'already_synced'].includes(result)) break;
        }
        transaction.failed = !taskResults.length || taskResults.some((item) => !['accepted', 'already_synced'].includes(item.result));
        return taskResults;
      });
      taskResults = outcome.value;
      if (outcome.rolledBack) taskResults = taskResults.map((item) => ({
        ...item, result: 'needs_retry', data: null,
        message: 'لم تُعتمد الجلسة البديلة؛ بقي الاعتماد السابق محفوظًا. أعد المحاولة.',
      }));
    } catch (error) {
      taskResults = (Array.isArray(session?.tasks) ? session.tasks : []).map((item) => ({ taskId: Number(item.taskId || 0),
        result: 'needs_retry', data: null, message: publicErrorMessage(error), requestId: req.traceId }));
    }
    const failedTask = taskResults.find((item) => !['accepted', 'already_synced'].includes(item.result));
    const result = failedTask?.result || (taskResults.length ? 'accepted' : 'conflict');
    if (['invalid_sequence', 'needs_retry', 'server_error'].includes(result)) blockedStudents.add(studentId);
    results.push({ sessionId: session?.sessionId, result, tasks: taskResults });
  }
  res.json({ results });
});

app.get('/api/students', async (req, res, next) => {
  try {
    const filters = [];
    const params = [];

    if (req.auth?.role === 'supervisor') {
      filters.push(`EXISTS (
        SELECT 1 FROM supervisor_committees sc
        WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id
      )`);
      params.push(req.auth.id);
    }

    if (req.query.committeeId === 'none') {
      filters.push('s.committee_id IS NULL');
    } else if (req.query.committeeId && req.query.committeeId !== 'all') {
      filters.push('s.committee_id = ?');
      params.push(req.query.committeeId);
    }

    if (req.query.search) {
      filters.push('s.name LIKE ?');
      params.push(`%${req.query.search}%`);
    }

    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
    const [rows] = await db().query(
      `
      SELECT
        s.id,
        s.name,
        s.login_number AS loginNumber,
        s.national_id AS nationalId,
        s.guardian_phone AS guardianPhone,
        s.committee_id AS committeeId,
        s.points,
        s.store_balance AS storeBalance,
        c.name AS committeeName
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      ${where}
      ORDER BY s.created_at DESC
      `,
      params
    );

    const canViewStudentDetails = req.auth?.role === 'manager' || (
      ['supervisor', 'admin'].includes(req.auth?.role) &&
      await hasSupervisorDashboardPermission(req.auth.id, ['students', 'whatsappSend'])
    );

    res.json(canViewStudentDetails ? rows : rows.map((row) => ({
      id: row.id,
      name: row.name,
      committeeId: row.committeeId,
      committeeName: row.committeeName,
      points: row.points,
    })));
  } catch (error) {
    next(error);
  }
});

app.get('/api/whatsapp/status', requirePermission('whatsappSend'), async (_req, res) => {
  try {
    await refreshWhatsAppState({ waitMs: 2000 });
  } catch (error) {
    whatsAppState.ready = false;
    whatsAppState.qr = '';
    whatsAppState.status = 'error';
    whatsAppState.message = error.message || 'تعذر تجهيز باركود واتساب.';
  }
  res.json(whatsAppState);
});

app.post('/api/whatsapp/disconnect', requirePermission('whatsappSend'), async (_req, res, next) => {
  try {
    await disconnectWhatsAppClient();
    res.json(whatsAppState);
  } catch (error) {
    next(error);
  }
});

const allowedWhatsAppAttachmentTypes = new Set([
  'application/pdf',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const sanitizeWhatsAppAttachmentName = (value) => Array.from(String(value || 'attachment'))
  .map((character) => {
    const code = character.codePointAt(0);
    return character === '/' || character === '\\' || code < 32 || code === 127 ? '_' : character;
  })
  .join('')
  .trim()
  .slice(0, 255);

app.post('/api/whatsapp/send', requirePermission('whatsappSend'), async (req, res, next) => {
  try {
    const recipientType = ['students', 'supervisors'].includes(req.body.recipientType)
      ? req.body.recipientType
      : null;
    const normalizeRecipientIds = (value) => [...new Set(
      (Array.isArray(value) ? value : [])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0)
    )];
    const studentIds = normalizeRecipientIds(req.body.studentIds);
    const supervisorIds = normalizeRecipientIds(req.body.supervisorIds);
    const messageTemplate = String(req.body.message || '').trim();
    const attachment = req.body.attachment?.data && req.body.attachment.type
      ? {
          name: sanitizeWhatsAppAttachmentName(req.body.attachment.name),
          type: String(req.body.attachment.type || '').trim().toLowerCase().slice(0, 120),
          data: String(req.body.attachment.data || '').replace(/^data:[^;]+;base64,/, ''),
        }
      : null;
    const selectedIds = recipientType === 'supervisors' ? supervisorIds : studentIds;

    const rejectInvalidWhatsAppMessageResult = await rejectInvalidWhatsAppMessage({ recipientType, selectedIds, messageTemplate, attachment, res });
    if (rejectInvalidWhatsAppMessageResult) { return rejectInvalidWhatsAppMessageResult; }
        await refreshWhatsAppState({ waitMs: 10000 });
    if (!whatsAppState.ready) {
      return res.status(409).json({ message: WHATSAPP_LINK_REQUIRED_MESSAGE });
    }

    const placeholders = selectedIds.map(() => '?').join(',');
    const [recipients] = recipientType === 'supervisors'
      ? await db().query(
          `
          SELECT id, name, login_number AS loginNumber, phone AS guardianPhone, job_title AS committeeName
          FROM supervisors
          WHERE role = 'supervisor' AND id IN (${placeholders})
          ORDER BY name ASC
          `,
          selectedIds
        )
      : await db().query(
          `
          SELECT
            s.id,
            s.name,
            s.login_number AS loginNumber,
            s.guardian_phone AS guardianPhone,
            c.name AS committeeName
          FROM students s
          LEFT JOIN committees c ON c.id = s.committee_id
          WHERE s.id IN (${placeholders})
          ORDER BY s.name ASC
          `,
          selectedIds
        );

    const prepared = [];
    const failed = [];

    await sendPreparedWhatsAppRecipients({ recipients, failed, messageTemplate, attachment, recipientType, prepared });

    return sendWhatsAppResult(res, prepared, failed, 'لم يتم إرسال أي رسالة.');
  } catch (error) {
    next(error);
  }
});

app.get('/api/students/:id', async (req, res, next) => {
  try {
    const [rows] = await db().query(
      `
      SELECT
        s.id,
        s.name,
        s.login_number AS loginNumber,
        s.national_id AS nationalId,
        s.guardian_phone AS guardianPhone,
        s.committee_id AS committeeId,
        s.points,
        c.name AS committeeName
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      WHERE s.id = ?
      `,
      [req.params.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'الطالب غير موجود.' });
    }

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
});

app.post('/api/students', requirePermission('students'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const name = normalizeAccountName(req.body.name, 'اسم الطالب');
    const loginNumber = normalizeAccountLoginNumber(req.body.loginNumber);
    const cleanNationalId = normalizeOptionalNationalId(req.body.nationalId);
    const guardianPhone = normalizeAccountPhone(req.body.guardianPhone);
    const { committeeId } = req.body;
    const cleanCommitteeId = normalizeOptionalCommitteeId(committeeId);
    const [validatedCommitteeId] = await ensureCommitteeIdsExist(connection, cleanCommitteeId);

    await connection.beginTransaction();
    await ensureLoginNumberIsAvailable(connection, loginNumber);
    await assertStudentIdentityAvailable(connection, cleanNationalId);
    const [result] = await connection.query(
      `
      INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id)
      VALUES (?, ?, ?, ?, ?)
      `,
      [name, loginNumber, cleanNationalId, guardianPhone, validatedCommitteeId]
    );

    const [rows] = await connection.query(
      `
      SELECT
        s.id,
        s.name,
        s.login_number AS loginNumber,
        s.national_id AS nationalId,
        s.guardian_phone AS guardianPhone,
        s.committee_id AS committeeId,
        s.points,
        c.name AS committeeName
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      WHERE s.id = ?
      `,
      [result.insertId]
    );

    await connection.commit();
    res.status(201).json(rows[0]);
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/students/bulk', requirePermission('students'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const students = Array.isArray(req.body.students) ? req.body.students : [];

    if (!students.length) {
      return res.status(422).json({ message: 'لا توجد بيانات طلاب للحفظ.' });
    }
    if (students.length > 500) {
      return res.status(422).json({ message: 'الحد الأعلى للاستيراد في العملية الواحدة هو 500 طالب.' });
    }
    const cleaned = students.map((student, index) => {
      try {
        return {
          name: normalizeAccountName(student.name, 'اسم الطالب'),
          nationalId: normalizeOptionalNationalId(student.nationalId),
          guardianPhone: normalizeAccountPhone(student.guardianPhone),
          committeeId: Number(normalizeOptionalCommitteeId(student.committeeId)),
          requestedLoginNumber: normalizeAccountLoginNumber(student.loginNumber),
        };
      } catch (error) {
        throw invalidInput(`الصف ${index + 1}: ${error.message}`);
      }
    });
    const committeeIds = await ensureCommitteeIdsExist(connection, cleaned.map((student) => student.committeeId));
    const validCommitteeIds = new Set(committeeIds);
    if (cleaned.some((student) => !validCommitteeIds.has(student.committeeId))) {
      throw invalidInput('إحدى الحلقات المختارة غير موجودة.');
    }

    await connection.beginTransaction();
    const usedLoginNumbers = await loadUsedLoginNumbers(connection);
    const inserted = [];
    for (const student of cleaned) {
      const loginNumber = student.requestedLoginNumber;
      if (usedLoginNumbers.has(loginNumber)) {
        await connection.rollback();
        return res.status(409).json({ message: `رقم الدخول ${loginNumber} مستخدم؛ صححه قبل الاستيراد.` });
      }

      usedLoginNumbers.add(loginNumber);
      await assertStudentIdentityAvailable(connection, student.nationalId);
      const [result] = await connection.query(
        `
        INSERT INTO students (name, login_number, national_id, guardian_phone, committee_id)
        VALUES (?, ?, ?, ?, ?)
        `,
        [student.name, loginNumber, student.nationalId, student.guardianPhone, student.committeeId]
      );
      inserted.push(result.insertId);
    }
    await connection.commit();
    res.status(201).json({ ok: true, count: inserted.length, ids: inserted });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.put('/api/students/:id', requirePermission('students'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const name = normalizeAccountName(req.body.name, 'اسم الطالب');
    const guardianPhone = normalizeAccountPhone(req.body.guardianPhone);
    const { committeeId } = req.body;
    const cleanCommitteeId = normalizeOptionalCommitteeId(committeeId);
    const [validatedCommitteeId] = await ensureCommitteeIdsExist(connection, cleanCommitteeId);
    const cleanLoginNumber = normalizeAccountLoginNumber(req.body.loginNumber);
    const cleanNationalId = normalizeOptionalNationalId(req.body.nationalId);
    // The balance is only changed by an «إضافة / خصم» amount, never by writing the final value.
    const adjustment = normalizeStudentGradeAdjustment({
      type: req.body.gradeAdjustmentType,
      amount: req.body.gradeAdjustmentAmount,
      reason: req.body.gradeAdjustmentReason,
    });
    const settings = await loadSettings();
    await connection.beginTransaction();
    const [[current]] = await connection.query(
      'SELECT points, login_number AS loginNumber FROM students WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!current) {
      await connection.rollback();
      return res.status(404).json({ message: 'الطالب غير موجود.' });
    }
    await assertStudentIdentityAvailable(connection, cleanNationalId, req.params.id);
    assertGradeAdjustmentAllowed(current.points, adjustment);
    await ensureLoginNumberIsAvailable(connection, cleanLoginNumber, { type: 'student', id: req.params.id });
    await transferStudentCommittee(connection, req.params.id, validatedCommitteeId, settings);
    await connection.query(
      `
      UPDATE students
      SET name = ?, login_number = ?, national_id = ?, guardian_phone = ?, committee_id = ?
      WHERE id = ?
      `,
      [name, cleanLoginNumber, cleanNationalId, guardianPhone, validatedCommitteeId, req.params.id]
    );
    if (String(current.loginNumber || '').trim() !== cleanLoginNumber) {
      await revokeAuthSessionsForUser(connection, 'student', req.params.id);
    }
    if (adjustment) {
      const today = getSaudiDateTimeParts().date;
      const effectiveDelta = await applyStudentPointDelta(
        connection,
        req.params.id,
        adjustment.delta,
        settings,
        { date: today }
      );
      await logStudentPointTransaction(connection, {
        studentId: req.params.id,
        supervisorId: null,
        actorRole: req.auth?.role || 'manager',
        actorName: req.auth?.name || 'المدير',
        type: effectiveDelta > 0 ? 'increase' : 'deduction',
        points: Math.abs(effectiveDelta),
        reason: adjustment.reason,
        date: today,
        sourceType: 'manager_adjustment',
      });
    }
    const [[updated]] = await connection.query('SELECT points FROM students WHERE id = ?', [req.params.id]);
    await connection.commit();
    res.json({ ok: true, points: roundPoints(updated?.points) });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.patch('/api/students/:id/committee', requirePermission('students'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const cleanCommitteeId = normalizeOptionalCommitteeId(req.body.committeeId);
    const [validatedCommitteeId] = await ensureCommitteeIdsExist(connection, cleanCommitteeId);
    const settings = await loadSettings(connection);
    await connection.beginTransaction();
    await transferStudentCommittee(connection, req.params.id, validatedCommitteeId, settings);
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally { connection.release(); }
});

app.delete('/api/students/:id', requirePermission('students'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    await connection.beginTransaction();
    const affectedRows = await deleteStudentWithRelations(connection, req.params.id);
    if (!affectedRows) {
      await connection.rollback();
      return res.status(404).json({ message: 'الطالب غير موجود.' });
    }
    await connection.commit();
    res.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/students/:id/records', async (req, res, next) => {
  try {
    const [records] = await db().query(
      `
      SELECT id, DATE_FORMAT(record_date, '%Y-%m-%d') AS date, status, points
      FROM attendance_records
      WHERE student_id = ?
      ORDER BY record_date DESC
      `,
      [req.params.id]
    );

    const [summaryRows] = await db().query(
      `
      SELECT
        SUM(status IN ('present', 'late')) AS presentDays,
        SUM(status = 'late') AS lateDays,
        SUM(status = 'absent') AS absentDays,
        COALESCE(SUM(points), 0) AS totalPoints
      FROM attendance_records
      WHERE student_id = ?
      `,
      [req.params.id]
    );

    res.json({
      records,
      summary: {
        presentDays: Number(summaryRows[0].presentDays || 0),
        lateDays: Number(summaryRows[0].lateDays || 0),
        absentDays: Number(summaryRows[0].absentDays || 0),
        totalPoints: Number(summaryRows[0].totalPoints || 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/attendance/status', async (req, res, next) => {
  try {
    const role = String(req.query.role || '');
    const id = req.query.id;
    const today = getSaudiDateTimeParts().date;
    const settings = await loadSettings();
    if (req.auth?.role !== 'manager' && (req.auth?.role !== role || Number(req.auth?.id) !== Number(id))) {
      return res.status(403).json({ message: 'لا يمكنك عرض تحضير حساب آخر.' });
    }

    if (!settings.attendanceAccountEnabled || !['student', 'supervisor'].includes(role) || !id) {
      return res.json({ enabled: false, canAttend: false, alreadyPresent: false, status: null, date: today });
    }

    const isAvailableDay = role === 'supervisor'
      ? isRecitationSessionDay(today, settings)
      : isAttendanceDay(today, settings);

    if (!isAvailableDay) {
      return res.json({ enabled: true, canAttend: false, alreadyPresent: false, status: null, date: today });
    }

    const table = role === 'student' ? 'attendance_records' : 'supervisor_attendance_records';
    const idColumn = role === 'student' ? 'student_id' : 'supervisor_id';
    const [rows] = await db().query(
      `
      SELECT status, TIME_FORMAT(check_in_time, '%H:%i') AS checkInTime
      FROM ${table}
      WHERE ${idColumn} = ? AND record_date = ?
      LIMIT 1
      `,
      [id, today]
    );
    const record = rows[0] || null;

    res.json({
      enabled: true,
      canAttend: !isStudentAttendedStatus(record?.status),
      alreadyPresent: isStudentAttendedStatus(record?.status),
      status: record?.status || null,
      checkInTime: record?.checkInTime || null,
      date: today,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/students/:id/attendance', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const now = getSaudiDateTimeParts();
    const settings = await loadSettings();
    const teacherMode = await isTeacherAttendanceRequest(req, settings);
    if (req.body.mode === 'recitation_teacher' && !teacherMode) {
      return res.status(403).json({ message: 'تحضير جلسة التسميع غير متاح لهذا الحساب.' });
    }
    const manualMode = teacherMode || (req.body.mode === 'manual' && await canUseManualAttendance(req));
    if (manualMode && req.body.date && !isValidDateOnly(req.body.date)) return res.status(422).json({ message: 'تاريخ التحضير غير صحيح.' });
    const rejectDisabledAttendanceModeResult = await rejectDisabledAttendanceMode({ manualMode, teacherMode, req, settings, res });
    if (rejectDisabledAttendanceModeResult) { return rejectDisabledAttendanceModeResult; }
    const { manualStatus, date } = normalizeStudentAttendanceInput(manualMode, req, now);
    if (manualMode && !manualStatus) {
      return res.status(422).json({ message: 'اختر حالة الطالب أولاً.' });
    }
    const status = manualMode ? manualStatus : 'present';
    await assertGradeDate(connection, Number(req.params.id), date);
    const time = now.time;
    const recordedTime = manualMode ? null : time;
    const rejectInvalidAttendanceTimeResult = await rejectInvalidAttendanceTime({ date, now, settings, manualMode, time, res });
    if (rejectInvalidAttendanceTimeResult) { return rejectInvalidAttendanceTimeResult; }
    const distance = !manualMode ? validateAttendanceLocation(settings, req.body) : null;
    const [students] = await connection.query('SELECT id FROM students WHERE id = ?', [req.params.id]);
    if (!students[0]) {
      return res.status(404).json({ message: 'الطالب غير موجود.' });
    }

    await connection.beginTransaction();
    const { previous } = await saveStudentAttendance(connection, {
      studentId: Number(req.params.id), date, status, checkInTime: recordedTime,
      actorRole: req.auth?.role || 'system', actorName: req.auth?.name || 'النظام', actorId: req.auth?.id,
    }, settings);
    if (previous?.status === status) req.activitySkip = true;
    await connection.commit();
    notifyChangedStudentAbsence(status, previous, settings, req, date);
    res.json({
      ok: true,
      date,
      status,
      time: recordedTime,
      distance,
      alreadyPresent: previous?.status === status,
      serverRecordedAt: Date.now(),
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/students/:id/absence', requirePermission('manualAttendance'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    if (req.auth?.role === 'supervisor' && !await hasSupervisorStudentPlanAccess(req, req.params.id)) {
      return res.status(403).json({ message: 'يمكنك تحضير طلاب حلقاتك فقط.' });
    }
    const now = getSaudiDateTimeParts();
    const settings = await loadSettings();
    const date = req.body.date || now.date;
    await assertGradeDate(connection, Number(req.params.id), date, { today: now.date });
    if (date > now.date) {
      return res.status(422).json({ message: 'لا يمكن تسجيل الغياب في تاريخ مستقبلي.' });
    }
    if (!isRecitationSessionDay(date, settings)) {
      return res.status(403).json({ message: 'لا توجد جلسة تسميع في هذا اليوم.' });
    }
    const [students] = await connection.query('SELECT id FROM students WHERE id = ?', [req.params.id]);
    if (!students[0]) {
      return res.status(404).json({ message: 'الطالب غير موجود.' });
    }

    await connection.beginTransaction();
    const { previous } = await saveStudentAttendance(connection, {
      studentId: Number(req.params.id),
      date,
      status: 'absent',
      actorRole: req.auth?.role || 'manager',
      actorName: req.auth?.name || 'المدير',
      actorId: req.auth?.id,
    }, settings);
    if (previous?.status === 'absent') {
      req.activitySkip = true;
    }
    await connection.commit();
    if (
      previous?.status !== 'absent'
      && settings.automaticAbsenceMessageEnabled
      && settings.attendanceAbsentTemplate
    ) {
      void notifyStudentGuardianAbsenceOnce(req.params.id, settings.attendanceAbsentTemplate, date).catch(() => {});
    }

    res.json({ ok: true, date, status: 'absent' });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/supervisors/:id/attendance', async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    if (['supervisor', 'reciter'].includes(req.auth?.role) && req.body.mode === 'manual') {
      return res.status(403).json({ message: 'تحضير المعلمين والإدارة متاح للمشرف فقط.' });
    }
    const now = getSaudiDateTimeParts();
    const settings = await loadSettings();
    const manualMode = req.body.mode === 'manual' && await canUseManualAttendance(req);
    if (!manualMode) return res.status(403).json({ message: 'استخدم تحضير الحساب.' });
    if (settings.staffAttendanceSource !== 'supervisor') {
      return res.status(403).json({ message: 'تحضير المعلمين والإدارة مضبوط عن طريق حساباتهم.' });
    }
    const requestedDate = manualMode ? (req.body.date || now.date) : now.date;
    const date = requestedDate;
    if (!isValidDateOnly(date)) return res.status(422).json({ message: 'تاريخ التحضير غير صحيح.' });
    if (!isRecitationSessionDay(date, settings)) return res.status(422).json({ message: 'لا يوجد تحضير في هذا اليوم.' });
    const status = manualMode ? normalizeManualAttendanceStatus(req.body.status, 'present') : 'present';
    const time = now.time;
    const recordedTime = manualMode ? null : time;
    if (date > now.date) {
      return res.status(422).json({ message: 'لا يمكن تسجيل الحضور في تاريخ مستقبلي.' });
    }
    const distance = null;
    const [supervisors] = await connection.query("SELECT id, DATE_FORMAT(created_at, '%Y-%m-%d') AS joined FROM supervisors WHERE id = ? AND role IN ('supervisor', 'reciter', 'admin')", [req.params.id]);
    if (!supervisors[0]) {
      return res.status(404).json({ message: 'الحساب غير موجود.' });
    }
    if (supervisors[0].joined && date < supervisors[0].joined) return res.status(422).json({ message: 'لا يمكن التحضير قبل إنشاء الحساب.' });

    await connection.beginTransaction();
    const [previousRows] = await connection.query(
      'SELECT status, points FROM supervisor_attendance_records WHERE supervisor_id = ? AND record_date = ? FOR UPDATE',
      [req.params.id, date]
    );
    const previous = previousRows[0] || null;
    if (previous?.status === status) {
      req.activitySkip = true;
    }

    await connection.query(
      `
      INSERT INTO supervisor_attendance_records (supervisor_id, record_date, status, check_in_time, points)
      VALUES (?, ?, ?, ?, 0)
      ON DUPLICATE KEY UPDATE
        status = VALUES(status),
        check_in_time = VALUES(check_in_time),
        points = 0
      `,
      [req.params.id, date, status, recordedTime]
    );
    await connection.commit();

    res.json({ ok: true, date, status, time: recordedTime, distance, alreadyPresent: previous?.status === status });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post('/api/supervisors/:id/absence', requirePermission('manualAttendance'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    if (['supervisor', 'reciter'].includes(req.auth?.role)) {
      return res.status(403).json({ message: 'تحضير المعلمين والإدارة متاح للمشرف فقط.' });
    }
    const now = getSaudiDateTimeParts();
    const settings = await loadSettings();
    const requestedDate = req.body.date || now.date;
    const date = requestedDate;
    if (!isValidDateOnly(date)) return res.status(422).json({ message: 'تاريخ التحضير غير صحيح.' });
    if (!isRecitationSessionDay(date, settings)) return res.status(422).json({ message: 'لا يوجد تحضير في هذا اليوم.' });
    if (date > now.date) {
      return res.status(422).json({ message: 'لا يمكن تسجيل الغياب في تاريخ مستقبلي.' });
    }
    if (settings.staffAttendanceSource !== 'supervisor') {
      return res.status(403).json({ message: 'تحضير المعلمين والإدارة مضبوط عن طريق حساباتهم.' });
    }
    const [supervisors] = await connection.query("SELECT id FROM supervisors WHERE id = ? AND role IN ('supervisor', 'reciter', 'admin')", [req.params.id]);
    if (!supervisors[0]) {
      return res.status(404).json({ message: 'المعلم غير موجود.' });
    }

    await connection.beginTransaction();
    const [previousRows] = await connection.query(
      'SELECT status FROM supervisor_attendance_records WHERE supervisor_id = ? AND record_date = ? FOR UPDATE',
      [req.params.id, date]
    );
    if (previousRows[0]?.status === 'absent') {
      req.activitySkip = true;
    }
    const [result] = await connection.query(
      `
      INSERT INTO supervisor_attendance_records (supervisor_id, record_date, status, check_in_time, points)
      VALUES (?, ?, 'absent', NULL, 0)
      ON DUPLICATE KEY UPDATE status = 'absent', check_in_time = NULL, points = 0
      `,
      [req.params.id, date]
    );
    await connection.commit();

    res.json({ ok: true, date, status: 'absent', changed: result.affectedRows > 0 });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/reports/recitation-session-dates', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!isValidDateOnly(from) || !isValidDateOnly(to) || from > to) {
      return res.status(422).json({ message: 'نطاق التاريخ غير صحيح.' });
    }
    if (getDatesInRange(from, to).length > 62) {
      return res.status(422).json({ message: 'نطاق تقويم الجلسات لا يتجاوز شهرين.' });
    }

    const [rows] = await db().query(
      `
      SELECT DISTINCT DATE_FORMAT(session_date, '%Y-%m-%d') AS sessionDate
      FROM (
        SELECT task_date AS session_date
        FROM student_quran_tasks
        WHERE task_date BETWEEN ? AND ?
        UNION
        SELECT DATE(evaluated_at) AS session_date
        FROM student_quran_tasks
        WHERE evaluated_at IS NOT NULL
          AND DATE(evaluated_at) BETWEEN ? AND ?
        UNION
        SELECT record_date AS session_date
        FROM attendance_records
        WHERE record_date BETWEEN ? AND ?
        UNION
        SELECT record_date AS session_date
        FROM supervisor_attendance_records
        WHERE record_date BETWEEN ? AND ?
      ) actual_sessions
      WHERE session_date IS NOT NULL
      `,
      [from, to, from, to, from, to, from, to]
    );

    const settings = await loadSettings();
    const today = getSaudiDateTimeParts().date;
    const dates = new Set(rows.map((row) => String(row.sessionDate || '')).filter(Boolean));
    getDatesInRange(from, to).forEach((date) => {
      if (date >= today && isRecitationSessionDay(date, settings)) dates.add(date);
    });

    res.json({ dates: [...dates].sort((a, b) => a.localeCompare(b)) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/students', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    const settings = await loadSettings();
    const reportDate = getAttendanceSessionDate(req.query.date || getSaudiDateTimeParts().date, settings);
    const params = [reportDate];
    const filters = [];

    if (req.auth?.role === 'supervisor') {
      filters.push(`EXISTS (
        SELECT 1 FROM supervisor_committees sc
        WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id
      )`);
      params.push(req.auth.id);
    }

    if (req.query.committeeId && req.query.committeeId !== 'all') {
      filters.push('s.committee_id = ?');
      params.push(req.query.committeeId);
    }

    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
    const [rows] = await db().query(
      `
      SELECT
        s.id,
        s.name,
        s.login_number AS loginNumber,
        c.name AS committeeName,
        ar.status AS status,
        TIME_FORMAT(ar.check_in_time, '%H:%i') AS checkInTime,
        ar.record_date AS recordDate
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.record_date = ?
      ${where}
      ORDER BY COALESCE(c.name, 'بدون حلقة') ASC, s.name ASC
      `,
      params
    );

    res.json(rows);
  } catch (error) {
    next(error);
  }
});

/** Use the task direction for review or an alternate track and the plan direction for memorization. */
function getRecitationRangeDirection(anchor, plan) {
  return anchor.taskType === 'review' || anchor.track !== anchor.planTrack
    ? getQuranRangeDirection(taskStartPosition(anchor), taskEndPosition(anchor))
    : getQuranRangeDirection(
      { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
      { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) }
    );
}

/** Normalize and bound selected task IDs and bind them in the recitation scope query. */
function buildRequestedRecitationTaskScope(req, taskId, anchor) {
  const requestedTaskIds = [...new Set(
    (Array.isArray(req.body.taskIds) ? req.body.taskIds : [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0)
      .concat(taskId)
  )].slice(0, 100);
  const useCombinedTasks = requestedTaskIds.length > 1;
  const taskScopeSql = useCombinedTasks
    ? `id IN (${requestedTaskIds.map(() => '?').join(', ')})`
    : 'task_date = ?';
  const taskScopeParams = useCombinedTasks ? requestedTaskIds : [anchor.taskDate];
  return { taskScopeSql, taskScopeParams };
}

/** Require teacher attendance mode, an allowed role and an assigned student. */
async function isTeacherAttendanceRequest(req, settings) {
  return req.body.mode === 'recitation_teacher'
    && canTeacherSetRecitationAttendance(settings, req.auth?.role)
    && await hasSupervisorStudentPlanAccess(req, req.params.id);
}

/** Normalize the selected date and manual status while keeping self attendance on the current day. */
function normalizeStudentAttendanceInput(manualMode, req, now) {
  const requestedDate = manualMode && isValidDateOnly(req.body.date) ? req.body.date : now.date;
  const date = manualMode ? requestedDate : now.date;
  const manualStatus = manualMode ? normalizeManualAttendanceStatus(req.body.status, null) : null;
  return { manualStatus, date };
}

/** Normalize optional marks, idempotency identity and bounded warning and mistake counts. */
function normalizeRecitationEvaluationInput(req) {
  const ayahMarksPayload = Array.isArray(req.body.ayahMarks) ? req.body.ayahMarks : null;
  const wordMarksPayload = Array.isArray(req.body.wordMarks) ? req.body.wordMarks : null;
  const notMemorized = req.body.notMemorized === true;
  const rawRequestId = String(req.body.requestId || '').trim();
  const requestId = /^[A-Za-z0-9:_-]{8,80}$/.test(rawRequestId) ? rawRequestId : null;
  const markLimit = 1000;
  let warningCount = Math.min(markLimit, Math.max(0, Number(req.body.warningCount ?? req.body.warningsCount ?? 0)));
  let mistakeCount = Math.min(markLimit, Math.max(0, Number(req.body.mistakeCount ?? req.body.mistakesCount ?? 0)));
  return { warningCount, mistakeCount, notMemorized, requestId, ayahMarksPayload, wordMarksPayload, markLimit };
}

/** Notify an absence only when the attendance status actually changed and automatic messages are enabled. */
function notifyChangedStudentAbsence(status, previous, settings, req, date) {
  if (status === 'absent'
    && previous?.status !== 'absent'
    && settings.automaticAbsenceMessageEnabled
    && settings.attendanceAbsentTemplate) {
    void notifyStudentGuardianAbsenceOnce(req.params.id, settings.attendanceAbsentTemplate, date).catch(() => { });
  }
}

/** Build each memorization group once and retain the local plan limits. */
async function buildTeacherExecutionChoices(allRows, executionOptionsByGroup, connection, date, settings) {
  for (const row of allRows.filter((item) => item.taskType === 'memorization')) {
    const groupKey = `${row.planId}:${row.taskDate}:${row.taskType}:${row.track}:${Number(row.compensationIndex || 0)}`;
    if (executionOptionsByGroup.has(groupKey)) continue;
    const plan = {
      id: row.planId,
      studentId: row.studentId,
      startPage: row.planStartPage,
      startSurah: row.planStartSurah,
      startSurahName: row.planStartSurahName,
      startAyah: row.planStartAyah,
      endPage: row.planEndPage,
      endSurah: row.planEndSurah,
      endSurahName: row.planEndSurahName,
      endAyah: row.planEndAyah,
      dailyPages: row.planDailyPages,
      startDate: row.planStartDate,
      effectiveFrom: row.planEffectiveFrom,
      scheduleDays: row.planScheduleDays,
      scheduleAnchorPage: row.planScheduleAnchorPage,
      scheduleAnchorSurah: row.planScheduleAnchorSurah,
      scheduleAnchorAyah: row.planScheduleAnchorAyah,
    };
    const groupRows = allRows.filter((item) => `${item.planId}:${item.taskDate}:${item.taskType}:${item.track}:${Number(item.compensationIndex || 0)}` === groupKey);
    const direction = row.taskType === 'review' || row.track !== row.planTrack
      ? getQuranRangeDirection(taskStartPosition(row), taskEndPosition(row))
      : getQuranRangeDirection(
        { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
        { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) }
      );
    const ordered = [...groupRows].sort((first, second) => compareQuranPositionInDirection(taskStartPosition(first), taskStartPosition(second), direction));
    const start = taskStartPosition(ordered[0]);
    if (Number(row.compensationIndex || 0) > 0) {
      // A compensation recitation is exactly one missed day's amount.
      const end = taskEndPosition(ordered.at(-1) || row);
      executionOptionsByGroup.set(groupKey, {
        normalEnd: end,
        scheduledEnd: end,
        selectionStart: start,
        selectionEnd: end,
        selectionDirection: direction,
        options: [toQuranExecutionOption(end)],
      });
      continue;
    }
    const context = await getPlanProgressContext(connection, plan, date, settings, start);
    if (!context?.allowedEnd) continue;
    const candidates = await getQuranAyahsInPageRange(connection, start.page, context.allowedEnd.page);
    executionOptionsByGroup.set(groupKey, {
      normalEnd: context.normalEnd,
      scheduledEnd: context.scheduledEnd,
      options: candidates
        .filter((ayah) => compareQuranPositionInDirection(ayah, start, direction) >= 0
          && compareQuranPositionInDirection(ayah, context.allowedEnd, direction) <= 0)
        .sort((first, second) => compareQuranPositionInDirection(first, second, direction))
        .map(toQuranExecutionOption),
    });
  }
}

/** Calculate bounded evaluation scores from the actual range and the current task policy. */
async function calculateTaskEvaluationOutcome({ task, connection, notMemorized, warningCount, mistakeCount }) {
  const evaluatedRange = {
    startPage: task.fromPage,
    startSurah: task.fromSurah,
    startAyah: task.fromAyah,
    endPage: task.actualToPage || task.toPage,
    endSurah: task.actualToSurah || task.toSurah,
    endAyah: task.actualToAyah || task.toAyah,
  };
  const calculatedFaces = await calculateQuranRangeFaces(connection, evaluatedRange);
  const evaluatedFaces = calculatedFaces
    || Number(task.targetPages || 0)
    || Math.max(0.25, Math.abs(Number(evaluatedRange.endPage) - Number(evaluatedRange.startPage)) + 1);
  const gradingPolicy = await loadGradingPolicyForDate(connection, task.taskDate);
  const row = evaluateRecitationRow(gradingPolicy, {
    taskType: task.taskType,
    mistakes: mistakeCount,
    warnings: warningCount,
    manualFail: notMemorized,
  });
  // Scores are stored on a 100 scale for display; the exact grade lives in student_daily_grades.
  const toPercent = (value) => Math.round(Number(value) * 10000) / 100;
  const policy = {
    maxScore: 100,
    warningDeduction: toPercent(gradingPolicy.weeklyProgram.warningDeduction),
    mistakeDeduction: toPercent(gradingPolicy.weeklyProgram.mistakeDeduction),
    passingScore: toPercent(row.threshold),
  };
  const score = notMemorized ? 0 : Math.max(0, toPercent(row.score));
  const completed = row.passed;
  const _resolveRatingLabel = () => {
    if (notMemorized) {
      return RECITATION_FAILED_LABEL;
    }
    if (completed) {
      return 'ناجح';
    }
    return 'يحتاج إعادة';
  };
  const ratingLabel = _resolveRatingLabel();
  return { ratingLabel, score, policy, completed, evaluatedFaces };
}

/** Apply the day result of a whole recitation group: a failed group is failed on every row and repeated. */
async function applyRecitationGroupGrade({ task, connection, req, supervisorId }) {
  // A compensation is graded on its own and never changes the day's own grade.
  if (Number(task.compensationIndex || 0) > 0) return null;
  const group = await recomputeRecitationGroupGrade(connection, {
    planId: task.planId,
    studentId: task.studentId,
    date: task.taskDate,
    taskType: task.taskType,
    actor: { role: req.auth?.role || 'supervisor', id: supervisorId },
  });
  if (!group?.failed) return group;
  await connection.query(
    `UPDATE student_quran_tasks
     SET teacher_completed = 0,
         teacher_rating_label = CASE WHEN teacher_rating_key = ? THEN teacher_rating_label ELSE 'يحتاج إعادة' END
     WHERE id IN (${group.taskIds.map(() => '?').join(', ')}) AND evaluated_at IS NOT NULL`,
    [MANUAL_FAIL_RATING_KEY, ...group.taskIds],
  );
  return group;
}

/** First memorization position of the group in plan order, so the whole failed amount is repeated. */
async function getFirstGroupMemorizationTask(connection, task) {
  const [rows] = await connection.query(
    `SELECT t.id, t.from_page AS fromPage, t.from_surah AS fromSurah, t.from_ayah AS fromAyah,
       p.start_page AS startPage, p.start_surah AS startSurah, p.start_ayah AS startAyah,
       p.end_page AS endPage, p.end_surah AS endSurah, p.end_ayah AS endAyah
     FROM student_quran_tasks t
     JOIN student_quran_plans p ON p.id = t.plan_id
     WHERE t.plan_id = ? AND t.task_date = ? AND t.task_type = 'memorization'`,
    [task.planId, task.taskDate],
  );
  if (!rows.length) return task;
  const direction = getQuranRangeDirection(
    { page: Number(rows[0].startPage), surah: Number(rows[0].startSurah), ayah: Number(rows[0].startAyah) },
    { page: Number(rows[0].endPage), surah: Number(rows[0].endSurah), ayah: Number(rows[0].endAyah) },
  );
  const position = (row) => ({ page: Number(row.fromPage), surah: Number(row.fromSurah || 0), ayah: Number(row.fromAyah || 0) });
  const first = rows.reduce((earliest, row) => (
    compareQuranPositionInDirection(position(row), position(earliest), direction) < 0 ? row : earliest
  ));
  return { ...task, id: Number(first.id), fromPage: first.fromPage, fromSurah: first.fromSurah, fromAyah: first.fromAyah };
}

/** Persist local actual endpoints and execution state within the authorized recitation transaction. */
async function persistLocalRecitationRange(tasks, actualEnd, direction, context, connection) {
  for (const task of tasks) {
    const taskStart = taskStartPosition(task);
    const taskEnd = taskEndPosition(task);
    const beforeTask = compareQuranPositionInDirection(actualEnd, taskStart, direction) < 0;
    const partial = !beforeTask && compareQuranPositionInDirection(actualEnd, taskEnd, direction) < 0;
    const beyondNormal = compareQuranPositionInDirection(taskStart, context.normalEnd, direction) > 0;
    const _resolveConditional10 = () => {
      if (beforeTask) {
        return null;
      }
      if (partial) {
        return actualEnd.page;
      }
      return taskEnd.page;
    };
    const _resolveConditional11 = () => {
      if (beforeTask) {
        return null;
      }
      if (partial) {
        return actualEnd.surah;
      }
      return taskEnd.surah;
    };
    const _resolveConditional12 = () => {
      if (beforeTask) {
        return null;
      }
      if (partial) {
        return actualEnd.ayah;
      }
      return taskEnd.ayah;
    };
    const _resolveConditional13 = () => {
      if (beforeTask || partial) {
        return 'partial';
      }
      if (beyondNormal) {
        return 'extra';
      }
      return 'complete';
    };
    await connection.query(
      `UPDATE student_quran_tasks
         SET student_status = ?, actual_to_page = ?, actual_to_surah = ?, actual_to_ayah = ?, execution_state = ?,
             normal_to_page = ?, normal_to_surah = ?, normal_to_ayah = ?,
             scheduled_to_page = ?, scheduled_to_surah = ?, scheduled_to_ayah = ?
         WHERE id = ?`,
      [
        beforeTask ? 'not_done' : 'done',
        _resolveConditional10(),
        _resolveConditional11(),
        _resolveConditional12(),
        _resolveConditional13(),
        context.normalEnd.page, context.normalEnd.surah, context.normalEnd.ayah,
        context.scheduledEnd?.page || null, context.scheduledEnd?.surah || null, context.scheduledEnd?.ayah || null,
        task.id,
      ]
    );
  }
}

/** Extend the current memorization group without replacing its earlier selected segments. */
async function extendRecitationTaskRange({ actualEnd, currentEnd, direction, tasks, connection, context, plan, anchor, generationEndDate, actualStart }) {
  if (compareQuranPositionInDirection(actualEnd, currentEnd, direction) > 0) {
    const combinedTasksBeforeExtension = tasks;
    const extensionTaskDate = tasks.at(-1).taskDate;
    let cursor = await getAdjacentQuranAyahInDirection(connection, currentEnd, direction);
    let canExtendCurrentPageTask = true;
    let guard = 0;
    while (cursor && compareQuranPositionInDirection(cursor, actualEnd, direction) <= 0 && guard < 1000) {
      const segmentEnd = await getQuranTraversalPageEnd(connection, cursor, actualEnd, direction);
      if (canExtendCurrentPageTask && Number(cursor.page) === Number(currentEnd.page)) {
        const currentTask = tasks.at(-1);
        await connection.query(
          `UPDATE student_quran_tasks
             SET to_page = ?, to_surah = ?, to_ayah = ?,
                 normal_to_page = ?, normal_to_surah = ?, normal_to_ayah = ?,
                 scheduled_to_page = ?, scheduled_to_surah = ?, scheduled_to_ayah = ?
             WHERE id = ?`,
          [
            segmentEnd.page, segmentEnd.surah, segmentEnd.ayah,
            context.normalEnd.page, context.normalEnd.surah, context.normalEnd.ayah,
            context.scheduledEnd?.page || null, context.scheduledEnd?.surah || null, context.scheduledEnd?.ayah || null,
            currentTask.id,
          ]
        );
      } else {
        await insertPlanTask(connection, {
          plan, date: extensionTaskDate, type: 'memorization', fromPage: cursor.page, toPage: segmentEnd.page, targetPages: null, bounds: {
            fromSurah: cursor.surah,
            fromAyah: cursor.ayah,
            toSurah: segmentEnd.surah,
            toAyah: segmentEnd.ayah,
          }, progress: context
        });
      }
      canExtendCurrentPageTask = false;
      if (compareQuranPositionInDirection(segmentEnd, actualEnd, direction) >= 0) break;
      cursor = await getAdjacentQuranAyahInDirection(connection, segmentEnd, direction);
      guard += 1;
    }
    [tasks] = await connection.query(
      `SELECT id, plan_id AS planId, student_id AS studentId, DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate,
          task_type AS taskType, track, from_page AS fromPage, to_page AS toPage,
          from_surah AS fromSurah, from_ayah AS fromAyah, to_surah AS toSurah, to_ayah AS toAyah,
          target_pages AS targetPages, normal_to_page AS normalToPage, normal_to_surah AS normalToSurah,
          normal_to_ayah AS normalToAyah, scheduled_to_page AS scheduledToPage,
          scheduled_to_surah AS scheduledToSurah, scheduled_to_ayah AS scheduledToAyah
         FROM student_quran_tasks
         WHERE plan_id = ? AND student_id = ? AND task_date = ? AND task_type = 'memorization'
           AND NOT EXISTS (
             SELECT 1
             FROM student_quran_tasks newer
             WHERE newer.plan_id = student_quran_tasks.plan_id
               AND newer.task_date <= ?
               AND newer.task_date > student_quran_tasks.task_date
               AND newer.task_type = student_quran_tasks.task_type
             AND newer.track = student_quran_tasks.track
               AND newer.from_page = student_quran_tasks.from_page
               AND newer.to_page = student_quran_tasks.to_page
               AND COALESCE(newer.from_surah, 0) = COALESCE(student_quran_tasks.from_surah, 0)
               AND COALESCE(newer.from_ayah, 0) = COALESCE(student_quran_tasks.from_ayah, 0)
               AND COALESCE(newer.to_surah, 0) = COALESCE(student_quran_tasks.to_surah, 0)
               AND COALESCE(newer.to_ayah, 0) = COALESCE(student_quran_tasks.to_ayah, 0)
           )
         ORDER BY id ASC FOR UPDATE`,
      [plan.id, anchor.studentId, extensionTaskDate, generationEndDate]
    );
    const extensionTasks = tasks
      .filter((task) => compareQuranPositionInDirection(taskStartPosition(task), actualStart, direction) >= 0);
    tasks = [...new Map([...combinedTasksBeforeExtension, ...extensionTasks].map((task) => [Number(task.id), task])).values()]
      .sort((first, second) => compareQuranPositionInDirection(taskStartPosition(first), taskStartPosition(second), direction));
  }
  return tasks;
}

/** Send the authorized recipients sequentially with throttling and record each delivery outcome. */
async function sendPreparedWhatsAppRecipients({ recipients, failed, messageTemplate, attachment, recipientType, prepared }) {
  for (const [index, recipient] of recipients.entries()) {
    const phone = normalizeWhatsAppPhone(recipient.guardianPhone);
    if (!phone) {
      failed.push({ id: recipient.id, name: recipient.name, reason: 'رقم الجوال غير صالح.' });
      continue;
    }

    const message = fillWhatsAppTemplate(messageTemplate, recipient);
    let status = 'sent';
    let messageId = null;
    try {
      messageId = await sendWhatsAppOnce(db(), { phone, message, attachment,
        studentId: recipientType === 'students' ? recipient.id : null, send: sendWhatsAppMessage });
    } catch (error) {
      status = 'failed';
      const failureReason = error.message || 'تعذر الإرسال من واتساب المرتبط.';
      failed.push({ id: recipient.id, name: recipient.name, reason: failureReason });
    }

    prepared.push({
      id: messageId,
      recipientId: recipient.id,
      name: recipient.name,
      phone,
      message,
      status,
    });

    if (index < recipients.length - 1) {
      await wait(randomWhatsAppDelay());
    }
  }
}

/** Record execution segments and advance the plan only when the entire group passes. */
async function applyEvaluatedGroupSegments({ groupEvaluated, task, groupTasks, settings, connection, date, attemptResult }) {
  if (Number(task.compensationIndex || 0) > 0) {
    await applyEvaluatedCompensationGroup({ groupEvaluated, task, groupTasks, connection, attemptResult });
    return;
  }
  if (groupEvaluated && task.taskType === 'memorization') {
    const plan = {
      id: task.planId,
      studentId: task.studentId,
      track: task.track,
      startPage: task.startPage,
      startSurah: task.startSurah,
      startAyah: task.startAyah,
      endPage: task.endPage,
      endSurah: task.endSurah,
      endAyah: task.endAyah,
      dailyPages: task.dailyPages,
      startDate: task.startDate,
      effectiveFrom: task.effectiveFrom,
      scheduleDays: task.scheduleDays,
      scheduleAnchorPage: task.scheduleAnchorPage,
      scheduleAnchorSurah: task.scheduleAnchorSurah,
      scheduleAnchorAyah: task.scheduleAnchorAyah,
    };
    const direction = getQuranRangeDirection(
      { page: Number(plan.startPage), surah: Number(plan.startSurah), ayah: Number(plan.startAyah) },
      { page: Number(plan.endPage), surah: Number(plan.endSurah), ayah: Number(plan.endAyah) }
    );
    const ordered = [...groupTasks].sort((first, second) => compareQuranPositionInDirection(taskStartPosition(first), taskStartPosition(second), direction));
    const actualStart = taskStartPosition(ordered[0]);
    const last = ordered.at(-1);
    const actualEnd = {
      page: Number(last.actualToPage || last.toPage),
      surah: Number(last.actualToSurah || last.toSurah),
      ayah: Number(last.actualToAyah || last.toAyah),
    };
    const context = await getPlanProgressContext(connection, plan, date, settings, actualStart);
    const segments = await buildExecutionSegmentDetails(
      connection,
      context,
      actualEnd,
      settings,
    );
    if (segments.length) {
      await saveQuranExecutionSegments(connection, {
        plan,
        date,
        sourceType: 'teacher',
        sourceId: attemptResult.insertId,
        segments,
      });
    }
    if (groupTasks.every((row) => Number(row.teacherCompleted) === 1)) {
      // Passing a later recitation does not erase or block an earlier failed range.
      await recomputePlanMemorizationCursor(connection, plan);
    }
  }
}

/** Record a compensation recitation on its own: it never changes the day's regular result. */
async function applyEvaluatedCompensationGroup({ groupEvaluated, task, groupTasks, connection, attemptResult }) {
  if (!groupEvaluated || task.taskType !== 'memorization') return;
  const direction = getQuranRangeDirection(
    { page: Number(task.startPage), surah: Number(task.startSurah), ayah: Number(task.startAyah) },
    { page: Number(task.endPage), surah: Number(task.endSurah), ayah: Number(task.endAyah) },
  );
  const ordered = [...groupTasks].sort((first, second) => compareQuranPositionInDirection(taskStartPosition(first), taskStartPosition(second), direction));
  const start = taskStartPosition(ordered[0]);
  const end = taskEndPosition(ordered.at(-1));
  const faces = await calculateQuranRangeFaces(connection, {
    startPage: start.page, startSurah: start.surah, startAyah: start.ayah,
    endPage: end.page, endSurah: end.surah, endAyah: end.ayah,
  }) || groupTasks.reduce((sum, row) => sum + Number(row.targetPages || 0), 0);
  const passed = groupTasks.every((row) => Number(row.teacherCompleted) === 1);
  await connection.query(
    `UPDATE student_quran_execution_segments SET is_current = 0
     WHERE plan_id = ? AND task_date = ? AND source_type = 'teacher' AND segment_type = 'compensation'
       AND from_page = ? AND from_surah = ? AND from_ayah = ? AND is_current = 1`,
    [task.planId, task.taskDate, start.page, start.surah, start.ayah],
  );
  if (passed) {
    await connection.query(
      `INSERT INTO student_quran_execution_segments
        (plan_id, student_id, task_date, task_type, source_type, source_id, segment_type,
         from_page, from_surah, from_ayah, to_page, to_surah, to_ayah,
         amount_faces, is_current)
       VALUES (?, ?, ?, ?, 'teacher', ?, 'compensation', ?, ?, ?, ?, ?, ?, ?, 1)`,
      [task.planId, task.studentId, task.taskDate, task.track === 'mastery' ? 'mastery' : 'memorization',
        attemptResult?.insertId || null, start.page, start.surah, start.ayah, end.page, end.surah, end.ayah,
        roundQuranFaces(faces)],
    );
  }
}

/** Apply memorization outcome, cursor and rewards inside the existing recitation transaction. */
async function applyMemorizationEvaluationOutcome({ task, completed, connection, date, req, settings }) {
  if (task.taskType === 'memorization') {
    if (completed && task.previousTeacherCompleted !== 1) {
      await advancePlanAfterCompletedMemorization(connection, task);
    } else if (!completed && task.previousTeacherCompleted !== 0 && !Number(task.compensationIndex || 0)) {
      await rewindPlanAfterFailedMemorization(connection, task, {
        sessionDate: date,
        sessionTaskIds: req.recitationSessionTaskIds,
        settings,
      });
    }
  }
}

/** Persist repetition and listening counts according to the active task policy. */
async function saveTeacherExecutedRepetitions({ notMemorized, teacherExecutionMode, task, settings, req, connection, supervisorId }) {
  if (!notMemorized
    && teacherExecutionMode
    && task.taskType === 'memorization'
    && canTeacherExecuteQuranTask(settings, 'repeat')) {
    const _resolveExpectedRepeatCount2 = () => {
      if (task.track === 'mastery') {
        return settings.masteryRepeatCount;
      }
      return settings.memorizationRepeatCount;
    };
    const expectedRepeatCount = normalizeRepeatCount(
      _resolveExpectedRepeatCount2(),
      1
    );
    const requestedRepeatCount = Number(req.body.repeatCount ?? expectedRepeatCount);
    const _resolveActualRepeatCount3 = () => {
      if (Number.isFinite(requestedRepeatCount)) {
        return practiceCompletionCount(requestedRepeatCount, expectedRepeatCount);
      }
      return expectedRepeatCount;
    };
    const actualRepeatCount = _resolveActualRepeatCount3();
    const expectedListeningCount = getTeacherExpectedListeningCount(task, settings);
    const requestedListeningCount = Number(req.body.listeningCount ?? expectedListeningCount);
    const _resolveActualListeningCount3 = () => {
      if (expectedListeningCount > 0 && Number.isFinite(requestedListeningCount)) {
        return practiceCompletionCount(requestedListeningCount, expectedListeningCount);
      }
      return expectedListeningCount;
    };
    const actualListeningCount = _resolveActualListeningCount3();
    await connection.query(
      `UPDATE student_quran_tasks
         SET student_status = 'done',
             actual_to_page = COALESCE(actual_to_page, to_page),
             actual_to_surah = COALESCE(actual_to_surah, to_surah),
             actual_to_ayah = COALESCE(actual_to_ayah, to_ayah),
             actual_repeat_count = ?,
             actual_listening_count = ?,
             execution_state = CASE WHEN ? < ? OR ? < ? THEN 'partial' ELSE 'complete' END,
             execution_actor_role = 'teacher', execution_actor_id = ?, executed_at = NOW(3)
         WHERE plan_id = ?
           AND student_id = ?
           AND task_date = ?
           AND task_type = 'repeat' AND track = ?
           AND from_page = ?
           AND to_page = ?
           AND COALESCE(from_surah, 0) = COALESCE(?, 0)
           AND COALESCE(from_ayah, 0) = COALESCE(?, 0)
           AND COALESCE(to_surah, 0) = COALESCE(?, 0)
           AND COALESCE(to_ayah, 0) = COALESCE(?, 0)
           AND (execution_actor_role IS NULL OR execution_actor_role = 'teacher')`,
      [
        actualRepeatCount,
        actualListeningCount,
        actualRepeatCount,
        expectedRepeatCount,
        actualListeningCount,
        expectedListeningCount,
        supervisorId,
        task.planId,
        task.studentId,
        task.taskDate,
        task.track,
        task.fromPage,
        task.toPage,
        task.fromSurah,
        task.fromAyah,
        task.toSurah,
        task.toAyah,
      ]
    );
  }
}

/** Validate all selected verses and words before replacing marks, using the caller transaction and bound SQL values. */
async function saveValidatedRecitationMarks({ ayahMarksPayload, wordMarksPayload, connection, task, normalizedWordMarks, markLimit, normalizedAyahMarks, mistakeCount, warningCount, taskId, supervisorId }) {
  if (ayahMarksPayload || wordMarksPayload) {
    const allowedAyahs = await getQuranAyahsForTask(connection, task);
    const allowedByKey = new Map(allowedAyahs.map((ayah) => [`${ayah.surah}:${ayah.ayah}`, ayah]));
    const marksByKey = new Map();
    if (wordMarksPayload) {
      const pageNumbers = await getQcfTaskPageNumbers(task);
      const qcfPages = await Promise.all(pageNumbers.map((page) => getQcfMushafPage(page)));
      const words = qcfPages.flatMap((page) => page?.words || []);
      const wordIndexByLocation = new Map(words.map((word, index) => [word.location, index]));
      normalizedWordMarks = [];
      normalizeSelectedWordMarks({ wordMarksPayload, wordIndexByLocation, words, allowedByKey, normalizedWordMarks, marksByKey });
    } else {
      normalizeSelectedAyahMarks(ayahMarksPayload, allowedByKey, marksByKey, markLimit);
    }
    normalizedAyahMarks = [...marksByKey.values()].filter((mark) => mark.mistakeCount > 0 || mark.warningCount > 0);
    mistakeCount = normalizedAyahMarks.reduce((sum, mark) => sum + mark.mistakeCount, 0);
    warningCount = normalizedAyahMarks.reduce((sum, mark) => sum + mark.warningCount, 0);
    if (mistakeCount > markLimit || warningCount > markLimit) {
      throw Object.assign(new Error(`الحد الأعلى لكل نوع في الجلسة هو ${markLimit}.`), { statusCode: 422 });
    }
    await connection.query('DELETE FROM student_quran_task_ayah_marks WHERE task_id = ?', [taskId]);
    const markRows = normalizedAyahMarks.flatMap((mark) => {
      const verse = allowedByKey.get(`${mark.surah}:${mark.ayah}`);
      return [
        mark.mistakeCount > 0
          ? [taskId, mark.surah, mark.ayah, verse.textUthmani, 'mistake', mark.mistakeCount, supervisorId]
          : null,
        mark.warningCount > 0
          ? [taskId, mark.surah, mark.ayah, verse.textUthmani, 'warning', mark.warningCount, supervisorId]
          : null,
      ].filter(Boolean);
    });
    if (markRows.length) {
      await connection.query(
        `
          INSERT INTO student_quran_task_ayah_marks
            (task_id, surah_number, ayah_number, ayah_text, mark_type, occurrence_count, created_by)
          VALUES ?
          `,
        [markRows]
      );
    }
    await persistSelectedWordMarks(normalizedWordMarks, connection, taskId, supervisorId);
  }
  return { normalizedWordMarks, normalizedAyahMarks, mistakeCount, warningCount };
}

/** Replace word marks inside the caller transaction using parameterized bulk inserts. */
async function persistSelectedWordMarks(normalizedWordMarks, connection, taskId, supervisorId) {
  if (normalizedWordMarks) {
    await connection.query('DELETE FROM student_quran_task_word_marks WHERE task_id = ?', [taskId]);
    if (normalizedWordMarks.length) {
      await connection.query(
        `
            INSERT INTO student_quran_task_word_marks
              (task_id, page_number, start_surah, start_ayah, start_word_position, end_surah, end_ayah, end_word_position, selected_text, mark_type, notes, created_by)
            VALUES ?
            `,
        [normalizedWordMarks.map((mark) => [
          taskId,
          mark.page,
          mark.startSurah,
          mark.startAyah,
          mark.startWordPosition,
          mark.endSurah,
          mark.endAyah,
          mark.endWordPosition,
          mark.selectedText,
          mark.markType,
          mark.notes || null,
          supervisorId,
        ])]
      );
    }
  }
}

async function buildSupervisorAttendanceReport(query = {}) {
  return loadStaffAttendanceReport(query, db(), getSaudiDateTimeParts().date);
}

app.get('/api/reports/supervisors', requireManagementReportAccess, async (req, res, next) => {
  try {
    const report = await buildSupervisorAttendanceReport(req.query);

    res.json(report.rows);
  } catch (error) {
    next(error);
  }
});

async function buildOverviewReport({ from, startDate: requestedStartDate, date, to, endDate: requestedEndDate, queryExecutor = null, auth = null, committeeId = 'all' } = {}) {
    const reportDb = createOverviewReportScope(queryExecutor || db(), { auth, committeeId });
    const today = getSaudiDateTimeParts().date;
    let defaultStartDate = from || requestedStartDate || date;
    defaultStartDate = await resolveOverviewStartDate(defaultStartDate, reportDb, today);
  const startDate = String(from || requestedStartDate || date || defaultStartDate);
  const endDate = String(to || requestedEndDate || date || today);

    assertReportDateRange(startDate, endDate);

    const rangeDates = getDatesInRange(startDate, endDate);
    // Attendance is expected on the weekly program's attendance days (the grading policy's work days).
    const attendanceWeekDays = (await loadGradingPolicy(reportDb)).weeklyProgram.workDays.map(Number);
    const attendanceDates = await planScheduleDates(reportDb, startDate, minDateOnly(endDate, today), attendanceWeekDays);

    const [[totals]] = await reportDb.query(`
      SELECT
        (SELECT COUNT(*) FROM students WHERE ${reportDb.student('students.id')}) AS studentsCount,
        (SELECT COUNT(*) FROM committees WHERE ${reportDb.committee('committees.id')}) AS familiesCount,
        (SELECT COUNT(*) FROM supervisors WHERE ${reportDb.staff('supervisors.id')} AND role IN ('supervisor', 'reciter', 'admin') AND is_active = 1) AS supervisorsCount,
        (SELECT COALESCE(SUM(points), 0) FROM students WHERE ${reportDb.student('students.id')}) AS studentPoints,
        (SELECT COALESCE(SUM(points), 0) FROM committees WHERE ${reportDb.committee('committees.id')}) AS familyPoints
    `);
    const expectedQuranTaskFacesSql = quranRangeFacesSql('t', 'expected');
    const quranTaskFacesSql = quranRangeFacesSql('t', 'actual');
    const [[quranFaceTotals]] = await reportDb.query(
      `
      SELECT
        COALESCE(SUM(CASE
          WHEN t.task_type = 'memorization' AND ${acceptedMemorizationSql('t')}
          THEN ${quranTaskFacesSql}
          ELSE 0
        END), 0) AS memorizationFaces,
        COALESCE(SUM(CASE
          WHEN t.task_type = 'review' AND ${acceptedQuranExecutionSql('t')}
          THEN ${quranTaskFacesSql}
          ELSE 0
        END), 0) AS reviewFaces,
        COALESCE(SUM(CASE
          WHEN t.task_type = 'link' AND ${acceptedQuranExecutionSql('t')}
          THEN ${quranTaskFacesSql}
          ELSE 0
        END), 0) AS linkFaces
      FROM student_quran_tasks t
      WHERE t.task_date BETWEEN ? AND ? AND ${reportDb.student('t.student_id')}
      `,
      [startDate, endDate]
    );
    const grades = await buildGradingOverview(reportDb, {
      from: startDate,
      to: endDate,
      quranFaces: {
        memorization: quranFaceTotals.memorizationFaces,
        review: quranFaceTotals.reviewFaces,
        link: quranFaceTotals.linkFaces,
      },
    });

    const emptyStudentAttendance = { total: 0, present: 0, late: 0, excused: 0, absent: 0, notRecorded: 0 };
    const emptySupervisorAttendance = { total: 0, present: 0, late: 0, excused: 0, absent: 0, notRecorded: 0 };
    const dayPlaceholders = attendanceDates.map(() => '?').join(', ');
    const attendanceRangeParams = [startDate, endDate, ...attendanceDates];
    const [[studentAttendanceRows]] = await readOverviewStudentAttendance({ attendanceDates, attendanceWeekDays, reportDb, dayPlaceholders, attendanceRangeParams, emptyStudentAttendance });
    const [[supervisorAttendanceRows]] = await readOverviewSupervisorAttendance({ attendanceDates, attendanceWeekDays, reportDb, dayPlaceholders, attendanceRangeParams, emptySupervisorAttendance });

    const normalizeRangeAttendance = (row, expectedTotal) => {
      const present = Number(row.present || 0);
      const late = Number(row.late || 0);
      const excused = Number(row.excused || 0);
      const absent = Number(row.absent || 0);
      return {
        total: expectedTotal,
        present,
        late,
        excused,
        absent,
        notRecorded: Math.max(0, expectedTotal - present - late - excused - absent),
      };
    };
    const studentAttendance = normalizeRangeAttendance(
      studentAttendanceRows,
      Number(totals.studentsCount || 0) * attendanceDates.length
    );
    const supervisorAttendance = normalizeRangeAttendance(
      supervisorAttendanceRows,
      Number(totals.supervisorsCount || 0) * attendanceDates.length
    );

    const [[pointTotals]] = await reportDb.query(
      `
      SELECT
        COUNT(*) AS transactionsCount,
        COUNT(DISTINCT student_id) AS activeStudents,
        COALESCE(SUM(CASE WHEN transaction_type = 'increase' THEN points ELSE 0 END), 0) AS increasePoints,
        COALESCE(SUM(CASE WHEN transaction_type = 'deduction' THEN points ELSE 0 END), 0) AS deductionPoints
      FROM student_point_transactions
      WHERE transaction_date BETWEEN ? AND ? AND ${reportDb.student('student_id')}
      `,
      [startDate, endDate]
    );
    const [[familyStats]] = await reportDb.query(`
      SELECT
        COUNT(*) AS familiesCount,
        COALESCE(SUM(student_count > 0), 0) AS familiesWithStudents,
        COALESCE(SUM(student_count = 0), 0) AS emptyFamilies,
        COALESCE(AVG(student_count), 0) AS averageStudentsPerFamily
      FROM (
        SELECT c.id, COUNT(s.id) AS student_count
        FROM committees c
        LEFT JOIN students s ON s.committee_id = c.id
        WHERE ${reportDb.committee('c.id')}
        GROUP BY c.id
      ) family_counts
    `);
    const buildStudentQuranLeaderboard = async ({ taskType, track = null, completionCondition }) => {
      const params = [startDate, endDate, taskType];
      const trackClause = track ? 'AND t.track = ?' : '';
      if (track) params.push(track);
      const [rows] = await reportDb.query(
        `
        SELECT
          s.id,
          s.name,
          c.name AS committeeName,
          COALESCE(SUM(CASE WHEN ${completionCondition} THEN ${quranTaskFacesSql} ELSE 0 END), 0) AS faces,
          COUNT(DISTINCT CASE WHEN ${completionCondition} THEN t.task_date END) AS activeDays
        FROM students s
        LEFT JOIN committees c ON c.id = s.committee_id
        JOIN student_quran_tasks t ON t.student_id = s.id
        WHERE t.task_date BETWEEN ? AND ? AND ${reportDb.student('t.student_id')}
          AND t.task_type = ?
          ${trackClause}
        GROUP BY s.id, s.name, c.name
        HAVING faces > 0
        ORDER BY faces DESC, activeDays DESC, s.name ASC
        `,
        params
      );
      return rows.map((row) => ({
        ...row,
        faces: Number(row.faces || 0),
        activeDays: Number(row.activeDays || 0),
      }));
    };
    const [
      topReviewStudents,
      topLinkStudents,
      topMemorizationStudents,
    ] = await Promise.all([
      buildStudentQuranLeaderboard({ taskType: 'review', completionCondition: acceptedQuranExecutionSql('t') }),
      buildStudentQuranLeaderboard({ taskType: 'link', completionCondition: acceptedQuranExecutionSql('t') }),
      buildStudentQuranLeaderboard({ taskType: 'memorization', completionCondition: acceptedMemorizationSql('t') }),
    ]);
    const [committeeAchievementRows] = await reportDb.query(
      `
      SELECT
        c.id,
        c.name,
        COUNT(DISTINCT s.id) AS studentsCount,
        COALESCE(SUM(CASE WHEN t.task_type <> 'repeat' THEN ${expectedQuranTaskFacesSql} ELSE 0 END), 0) AS expectedFaces,
        COALESCE(SUM(CASE
          WHEN t.task_type = 'memorization' AND ${acceptedMemorizationSql('t')} THEN ${quranTaskFacesSql}
          WHEN t.task_type IN ('review', 'link') AND ${acceptedQuranExecutionSql('t')} THEN ${quranTaskFacesSql}
          ELSE 0
        END), 0) AS achievedFaces
      FROM committees c
      JOIN students s ON s.committee_id = c.id
      JOIN student_quran_tasks t ON t.student_id = s.id
      WHERE t.task_date BETWEEN ? AND ? AND ${reportDb.student('t.student_id')}
        AND t.task_type IN ('memorization', 'review', 'link')
      GROUP BY c.id, c.name
      HAVING expectedFaces > 0
      `,
      [startDate, endDate]
    );
    const topCommitteesByAchievement = committeeAchievementRows
      .map((row) => {
        const expectedFaces = Number(row.expectedFaces || 0);
        const achievedFaces = Number(row.achievedFaces || 0);
        return {
          ...row,
          studentsCount: Number(row.studentsCount || 0),
          expectedFaces,
          achievedFaces,
          completionRate: expectedFaces > 0 ? Math.min(100, Math.round((achievedFaces / expectedFaces) * 100)) : 0,
        };
      })
      .sort((a, b) => (
        b.completionRate - a.completionRate
        || b.achievedFaces - a.achievedFaces
        || String(a.name || '').localeCompare(String(b.name || ''), 'ar')
      ));
    const indicatorKeys = ['attendance', 'review', 'link', 'memorization'];
    const createIndicatorTotals = () => Object.fromEntries(
      indicatorKeys.map((key) => [key, { done: 0, total: 0 }])
    );
    const addIndicatorValue = (target, key, done = 0, total = 0) => {
      target[key].done += Number(done || 0);
      target[key].total += Number(total || 0);
    };
    const finalizeIndicators = (totalsMap) => Object.fromEntries(
      indicatorKeys.map((key) => {
        const done = Number(totalsMap[key]?.done || 0);
        const total = Number(totalsMap[key]?.total || 0);
        const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
        return [
          key,
          {
            done,
            total,
            percentage: Math.max(0, Math.min(100, percentage)),
          },
        ];
      })
    );
    const averageIndicatorPercentage = (metrics) => {
      const values = indicatorKeys
        .map((key) => metrics[key])
        .filter((metric) => Number(metric?.total || 0) > 0)
        .map((metric) => Number(metric.percentage || 0));
      if (!values.length) return 0;
      return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
    };
    const [committeeStudentRows] = await reportDb.query(`
      SELECT
        c.id AS committeeId,
        c.name AS committeeName,
        s.id AS studentId,
        s.name AS studentName,
        DATE_FORMAT(s.created_at, '%Y-%m-%d') AS joined
      FROM committees c
      LEFT JOIN students s ON s.committee_id = c.id
      WHERE ${reportDb.committee('c.id')}
      ORDER BY c.name ASC, s.name ASC
    `);
    const committeeIndicatorMap = new Map();
    const studentIndicatorMap = new Map();
    const attendanceExpectedPerStudent = attendanceDates.length;
    initializeCommitteeIndicators({ committeeStudentRows, committeeIndicatorMap, createIndicatorTotals, addIndicatorValue, attendanceExpectedPerStudent, attendanceDates, studentIndicatorMap });
    if (attendanceDates.length) {
    const [attendanceIndicatorRows] = await reportDb.query(
        `
        SELECT
          ar.student_id AS studentId,
          COUNT(DISTINCT ar.record_date) AS attendedDays
        FROM attendance_records ar
        WHERE ar.record_date BETWEEN ? AND ? AND ${reportDb.student('ar.student_id')}
          AND ar.record_date IN (${dayPlaceholders})
          AND ar.status IN ('present', 'late', 'excused')
        GROUP BY ar.student_id
        `,
        attendanceRangeParams
      );
      for (const row of attendanceIndicatorRows) {
        const entry = studentIndicatorMap.get(String(row.studentId));
        if (!entry) continue;
        const attendedDays = Number(row.attendedDays || 0);
        addIndicatorValue(entry.student.totals, 'attendance', attendedDays, 0);
        addIndicatorValue(entry.committee.totals, 'attendance', attendedDays, 0);
      }
    }
    const [quranIndicatorRows] = await reportDb.query(
      `
      SELECT
        t.student_id AS studentId,
        COALESCE(SUM(CASE WHEN t.task_type = 'review' THEN ${expectedQuranTaskFacesSql} ELSE 0 END), 0) AS reviewTotal,
        COALESCE(SUM(CASE WHEN t.task_type = 'review' AND ${acceptedQuranExecutionSql('t')} THEN ${quranTaskFacesSql} ELSE 0 END), 0) AS reviewDone,
        COALESCE(SUM(CASE
          WHEN t.task_type = 'link' THEN ${expectedQuranTaskFacesSql}
          ELSE 0 END), 0) AS linkTotal,
        COALESCE(SUM(CASE
          WHEN t.task_type = 'link' AND ${acceptedQuranExecutionSql('t')} THEN ${quranTaskFacesSql}
          ELSE 0 END), 0) AS linkDone,
        COALESCE(SUM(CASE WHEN t.task_type = 'memorization' THEN ${expectedQuranTaskFacesSql} ELSE 0 END), 0) AS memorizationTotal,
        COALESCE(SUM(CASE WHEN t.task_type = 'memorization' AND ${acceptedMemorizationSql('t')} THEN ${quranTaskFacesSql} ELSE 0 END), 0) AS memorizationDone
      FROM student_quran_tasks t
      WHERE t.task_date BETWEEN ? AND ? AND ${reportDb.student('t.student_id')}
        AND t.task_type IN ('memorization', 'review', 'link')
      GROUP BY t.student_id
      `,
      [startDate, endDate]
    );
    for (const row of quranIndicatorRows) {
      const entry = studentIndicatorMap.get(String(row.studentId));
      if (!entry) continue;
      for (const key of ['review', 'link', 'memorization']) {
        const total = Number(row[`${key}Total`] || 0);
        const done = Number(row[`${key}Done`] || 0);
        addIndicatorValue(entry.student.totals, key, done, total);
        addIndicatorValue(entry.committee.totals, key, done, total);
      }
    }
    const committeeIndicators = [...committeeIndicatorMap.values()]
      .map((committee) => {
        const metrics = finalizeIndicators(committee.totals);
        const students = committee.students
          .map((student) => {
            const studentMetrics = finalizeIndicators(student.totals);
            return {
              id: student.id,
              name: student.name,
              metrics: studentMetrics,
              overallPercentage: averageIndicatorPercentage(studentMetrics),
            };
          })
          .sort((a, b) => (
            b.overallPercentage - a.overallPercentage
            || String(a.name || '').localeCompare(String(b.name || ''), 'ar')
          ));
        return {
          id: committee.id,
          name: committee.name,
          studentsCount: committee.studentsCount,
          metrics,
          overallPercentage: averageIndicatorPercentage(metrics),
          students,
        };
      })
      .sort((a, b) => (
        b.overallPercentage - a.overallPercentage
        || String(a.name || '').localeCompare(String(b.name || ''), 'ar')
      ));

    const expectedStudentAttendance = grades.weeklyProgram.studentsList
      .reduce((sum, row) => sum + Number(row.attendanceDays || 0), 0);
    Object.assign(studentAttendance, normalizeRangeAttendance(studentAttendanceRows, expectedStudentAttendance));
    const [staffJoined] = await reportDb.query(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS joined FROM supervisors WHERE role IN ('supervisor', 'reciter', 'admin') AND is_active = 1 AND ${reportDb.staff('id')}`);
    const expectedStaffAttendance = staffJoined.reduce((sum, row) => sum + attendanceDates.filter(date => !row.joined || date >= row.joined).length, 0);
    Object.assign(supervisorAttendance, normalizeRangeAttendance(supervisorAttendanceRows, expectedStaffAttendance));
    const increasePoints = Number(pointTotals.increasePoints || 0);
    const deductionPoints = Number(pointTotals.deductionPoints || 0);

  return {
      date: startDate,
      period: {
        from: startDate,
        to: endDate,
        totalDays: rangeDates.length,
        attendanceDaysCount: attendanceDates.length,
      },
      totals: {
        studentsCount: Number(totals.studentsCount || 0),
        familiesCount: Number(totals.familiesCount || 0),
        supervisorsCount: Number(totals.supervisorsCount || 0),
        studentPoints: Number(totals.studentPoints || 0),
        familyPoints: Number(totals.familyPoints || 0),
        quranFaces: {
          memorization: Number(quranFaceTotals.memorizationFaces || 0),
          review: Number(quranFaceTotals.reviewFaces || 0),
          link: Number(quranFaceTotals.linkFaces || 0),
        },
      },
      grades,
      attendance: {
        students: studentAttendance,
        supervisors: supervisorAttendance,
      },
      points: {
        transactionsCount: Number(pointTotals.transactionsCount || 0),
        activeStudents: Number(pointTotals.activeStudents || 0),
        increasePoints,
        deductionPoints,
        netPoints: increasePoints - deductionPoints,
      },
      families: {
        familiesWithStudents: Number(familyStats.familiesWithStudents || 0),
        emptyFamilies: Number(familyStats.emptyFamilies || 0),
        averageStudentsPerFamily: Number(familyStats.averageStudentsPerFamily || 0),
      },
      quranLeaders: {
        review: topReviewStudents,
        link: topLinkStudents,
        memorization: topMemorizationStudents,
        committees: topCommitteesByAchievement,
      },
      committeeIndicators,
      studentLevels: await loadStudentLevels({
        query: reportDb.query,
        referenceConnection: queryExecutor || db(),
        scope: { filter: reportDb.student },
        acceptedSql: acceptedMemorizationSql,
        today,
      }),
      ...await buildOverviewRankings(reportDb, { from: startDate, to: endDate, attendanceDates, attendanceWeekDays, grades }),
  };
}

app.get('/api/reports/committees', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    const scope = createOverviewReportScope(db(), { auth: req.auth });
    const [rows] = await scope.query(`SELECT id, name FROM committees WHERE ${scope.committee('committees.id')} ORDER BY name`);
    res.json(rows);
  } catch (error) { next(error); }
});

app.get('/api/reports/overview', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    res.json(await buildOverviewReport({ ...req.query, queryExecutor: null, auth: req.auth }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/overview/export', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    const format = String(req.query.format || 'pdf').toLowerCase();
    const report = await buildOverviewReport({ ...req.query, queryExecutor: null, auth: req.auth });
    const from = String(report.period?.from || 'from');
    const to = String(report.period?.to || 'to');
    if (format === 'xlsx' || format === 'excel') {
      const buffer = await buildOverviewExcel(report);
      setDownloadHeaders(res, `الإحصائيات-${from}-إلى-${to}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
    const buffer = await buildOverviewPdf(report, { fontPair: resolvePdfFontPair() });
    setDownloadHeaders(res, `الإحصائيات-${from}-إلى-${to}.pdf`, 'application/pdf');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

const progressTaskTypes = ['memorization', 'repeat', 'review', 'link'];
const progressScoredTaskTypes = ['memorization', 'review', 'link'];

/** Initialize student and committee indicators with the same expected attendance denominator. */
function initializeCommitteeIndicators({ committeeStudentRows, committeeIndicatorMap, createIndicatorTotals, addIndicatorValue, attendanceExpectedPerStudent, attendanceDates = [], studentIndicatorMap }) {
  for (const row of committeeStudentRows) {
    const committeeKey = String(row.committeeId);
    if (!committeeIndicatorMap.has(committeeKey)) {
      committeeIndicatorMap.set(committeeKey, {
        id: row.committeeId,
        name: row.committeeName,
        studentsCount: 0,
        totals: createIndicatorTotals(),
        students: [],
      });
    }
    const committee = committeeIndicatorMap.get(committeeKey);
    if (!row.studentId) continue;
    const student = {
      id: row.studentId,
      name: row.studentName,
      totals: createIndicatorTotals(),
    };
    const expected = row.joined ? attendanceDates.filter(date => date >= row.joined).length : attendanceExpectedPerStudent;
    addIndicatorValue(student.totals, 'attendance', 0, expected);
    addIndicatorValue(committee.totals, 'attendance', 0, expected);
    committee.studentsCount += 1;
    committee.students.push(student);
    studentIndicatorMap.set(String(row.studentId), { committee, student });
  }
}

/** Reject malformed or reversed report dates before executing report queries. */
function assertReportDateRange(startDate, endDate) {
  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate)) {
    const error = new Error('صيغة التاريخ غير صحيحة.');
    error.status = 422;
    throw error;
  }
  if (startDate > endDate) {
    const error = new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
    error.status = 422;
    throw error;
  }
}

/** Read the first scoped attendance date when no explicit report start was supplied. */
async function resolveOverviewStartDate(defaultStartDate, reportDb, today) {
  if (!defaultStartDate) {
    const [[firstAttendance]] = await reportDb.query(`
      SELECT DATE_FORMAT(MIN(first_date), '%Y-%m-%d') AS firstDate
      FROM (
        SELECT MIN(record_date) AS first_date FROM attendance_records WHERE ${reportDb.student('student_id')}
        UNION ALL
        SELECT MIN(record_date) AS first_date FROM supervisor_attendance_records WHERE ${reportDb.staff('supervisor_id')}
      ) attendance_dates
    `);
    defaultStartDate = firstAttendance.firstDate || today;
  }
  return defaultStartDate;
}

/** Aggregate staff attendance with fixed SQL clauses and bound date and weekday values. */
async function readOverviewSupervisorAttendance({ attendanceDates, reportDb, dayPlaceholders, attendanceRangeParams, emptySupervisorAttendance }) {
  return attendanceDates.length
    ? await reportDb.query(
      `
        SELECT
          COALESCE(SUM(ar.status = 'present'), 0) AS present,
          COALESCE(SUM(ar.status = 'late'), 0) AS late,
          COALESCE(SUM(ar.status = 'excused'), 0) AS excused,
          COALESCE(SUM(ar.status = 'absent'), 0) AS absent
        FROM supervisor_attendance_records ar
        INNER JOIN supervisors s ON s.id = ar.supervisor_id
        WHERE ar.record_date BETWEEN ? AND ? AND ${reportDb.staff('ar.supervisor_id')}
          AND s.role IN ('supervisor', 'reciter', 'admin') AND s.is_active = 1
          AND ar.record_date IN (${dayPlaceholders})
        `,
      attendanceRangeParams
    )
    : [[emptySupervisorAttendance]];
}

/** Aggregate student attendance with fixed SQL clauses and bound date and weekday values. */
async function readOverviewStudentAttendance({ attendanceDates, reportDb, dayPlaceholders, attendanceRangeParams, emptyStudentAttendance }) {
  return attendanceDates.length
    ? await reportDb.query(
      `
        SELECT
          COALESCE(SUM(ar.status = 'present'), 0) AS present,
          COALESCE(SUM(ar.status = 'late'), 0) AS late,
          COALESCE(SUM(ar.status = 'excused'), 0) AS excused,
          COALESCE(SUM(ar.status = 'absent'), 0) AS absent
        FROM attendance_records ar
        INNER JOIN students s ON s.id = ar.student_id
        WHERE ar.record_date BETWEEN ? AND ? AND ${reportDb.student('ar.student_id')}
          AND ar.record_date IN (${dayPlaceholders})
        `,
      attendanceRangeParams
    )
    : [[emptyStudentAttendance]];
}

function emptyProgressTask() {
  return { expected: 0, done: 0, percentage: 0, details: [] };
}

function progressPercentage(done, expected) {
  return expected > 0 ? Math.round((done / expected) * 100) : null;
}

const reportColumns = [
  { key: 'name', label: 'الطالب', width: 24 },
  { key: 'committeeName', label: 'الحلقة', width: 20 },
  { key: 'attendance', label: 'الحضور', width: 12 },
  { key: 'late', label: 'التأخير', width: 10 },
  { key: 'excused', label: 'الاستئذان', width: 12 },
  { key: 'savedMemorization', label: 'المحفوظ خلال الفترة', width: 38 },
  { key: 'reviewRange', label: 'المراجعة خلال الفترة', width: 38 },
  { key: 'repeat', label: 'التكرار', width: 12 },
  { key: 'link', label: 'الربط', width: 12 },
  { key: 'currentShortage', label: 'النقص الحالي', width: 14 },
  { key: 'overall', label: 'النسبة الإجمالية', width: 16 },
];

const reportRatio = (done, expected) => `${Number(expected || 0)} / ${Number(done || 0)}`;

const reportFileName = (report, extension) => {
  const committee = String(report.period?.committeeName || 'كل الحلقات')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'التقرير';
  return `تقرير-${committee}-${report.period.from}-إلى-${report.period.to}.${extension}`;
};

const setDownloadHeaders = (res, filename, contentType) => {
  const fallback = filename.replace(/[^\x20-\x7E]+/g, '_');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
};

async function getFirstReportDate(connection) {
  const [[row]] = await connection.query(`
    SELECT DATE_FORMAT(MIN(first_date), '%Y-%m-%d') AS firstDate
    FROM (
      SELECT MIN(record_date) AS first_date FROM attendance_records
      UNION ALL
      SELECT MIN(task_date) AS first_date FROM student_quran_tasks
      UNION ALL
      SELECT DATE(MIN(created_at)) AS first_date FROM students
    ) report_dates
  `);
  return row.firstDate || getSaudiDateTimeParts().date;
}

async function getFirstRecitationSessionReportDate(connection) {
  const [[row]] = await connection.query(`
    SELECT DATE_FORMAT(MIN(a.session_date), '%Y-%m-%d') AS firstDate
    FROM student_quran_recitation_attempts a
    JOIN student_quran_tasks t ON t.id = a.task_id
    WHERE t.task_type IN ('memorization', 'review', 'link')
      AND a.is_official = 1
  `);
  return row.firstDate || getSaudiDateTimeParts().date;
}

async function convertActivePlansToPriorMemorization(connection) {
  const [plans] = await connection.query(
    `
    SELECT plan.id, plan.student_id AS studentId
    FROM student_quran_plans plan
    WHERE plan.status IN ('active', 'completed')
    FOR UPDATE
    `
  );
  let convertedPlans = 0;
  for (const plan of plans) {
    const priorRanges = await getPriorMemorizationRanges(connection, plan.id);
    const completedRanges = await getCompletedMemorizationRanges(connection, { planId: plan.id, approvedOnly: true });
    const mergedRanges = await mergeQuranRanges(connection, [...priorRanges, ...completedRanges]);
    for (const range of mergedRanges) {
      const coverage = await countMemorizedAyahsInRange(connection, priorRanges, getQuranRangeStart(range), getQuranRangeEnd(range));
      if (coverage.memorizedAyahs < coverage.totalAyahs) await savePriorMemorizationRange(connection, plan.id, plan.studentId, range);
    }
    convertedPlans += 1;
  }
  await connection.query("UPDATE student_quran_plans SET status = 'paused' WHERE status IN ('active', 'completed')");
  return { plans: convertedPlans };
}

function getReportRowValues(row) {
  return {
    name: row.name,
    committeeName: row.committeeName || 'بدون حلقة',
    attendance: reportRatio(row.attendance?.attended, row.attendance?.expected),
    late: Number(row.attendance?.late || 0),
    excused: Number(row.attendance?.excused || 0),
    savedMemorization: formatReportFaces(getTaskSummary(row, 'memorization', false, null, 'memorization').faces),
    reviewRange: formatReportFaces(getTaskSummary(row, 'review', false).faces),
    repeat: reportRatio(row.tasks?.repeat?.done, row.tasks?.repeat?.expected),
    link: formatReportFaces(getTaskSummary(row, 'link', false).faces),
    currentShortage: `${Number(row.planProgress?.shortageFaces || 0)} وجه`,
    overall: Number(row.overallPercentage || 0) / 100,
  };
}

function isAcceptedMemorizationTask(task) {
  return task.teacherCompleted === true || (
    task.teacherCompleted === null
    && task.studentStatus === 'done'
    && ['complete', 'partial', 'extra'].includes(task.executionState)
  );
}

function completedTaskAmount(items, predicate) {
  return [...new Set(items.filter(predicate).map((item) => item.actualPreview || item.preview).filter(Boolean))].join('، ');
}

async function buildProgressReport({
  from,
  startDate: requestedStartDate,
  date,
  to,
  endDate: requestedEndDate,
  committeeId = 'all',
  studentId = 'all',
  auth = null,
  queryExecutor = null,
} = {}) {
  const reportDb = queryExecutor || db();
  const today = getSaudiDateTimeParts().date;
  const startDate = String(from || requestedStartDate || date || today);
  const endDate = String(to || requestedEndDate || date || today);
  const selectedCommitteeId = String(committeeId || 'all');
  const selectedStudentId = String(studentId || 'all');

    assertReportDateRange(startDate, endDate);
    if (getDatesInRange(startDate, endDate).length > 370) {
    const error = new Error('اختر نطاقاً لا يتجاوز سنة واحدة.');
    error.status = 422;
      throw error;
    }

    await markExpiredPendingQuranTasks(reportDb, today);
    const settings = await loadSettings(reportDb);
    const recitationDays = getRecitationSessionDays(settings);
    const sessionDates = getDatesInRange(startDate, endDate)
      .filter((date) => recitationDays.includes(getWeekDayFromDate(date)));
    const sessionDateSet = new Set(sessionDates);
    const taskStartDate = sessionDates.length
      ? getPreviousRecitationSessionDate(sessionDates[0], settings)
      : startDate;

    const studentFilters = [];
    const studentParams = [];
  if (selectedCommitteeId !== 'all') {
      studentFilters.push('s.committee_id = ?');
    studentParams.push(selectedCommitteeId);
    }
  if (selectedStudentId !== 'all') {
    studentFilters.push('s.id = ?');
    studentParams.push(selectedStudentId);
  }
  restrictProgressReportToTeacher(auth, studentFilters, studentParams);
    const studentWhere = studentFilters.length ? `WHERE ${studentFilters.join(' AND ')}` : '';

    const [students] = await reportDb.query(
      `
      SELECT
        s.id,
        s.name,
        c.name AS committeeName,
        DATE_FORMAT(s.created_at, '%Y-%m-%d') AS createdDate,
        (SELECT DATE_FORMAT(MIN(p.created_at), '%Y-%m-%d') FROM student_quran_plans p WHERE p.student_id = s.id) AS planCreatedDate,
        active_plan.id AS activePlanId,
        active_plan.start_page AS planStartPage,
        active_plan.start_surah AS planStartSurah,
        active_plan.start_ayah AS planStartAyah,
        active_plan.end_page AS planEndPage,
        active_plan.end_surah AS planEndSurah,
        active_plan.end_ayah AS planEndAyah,
        active_plan.daily_pages AS planDailyPages,
        active_plan.next_memorization_page AS planNextPage,
        active_plan.next_memorization_surah AS planNextSurah,
        active_plan.next_memorization_ayah AS planNextAyah,
        DATE_FORMAT(active_plan.start_date, '%Y-%m-%d') AS planStartDate,
        DATE_FORMAT(active_plan.effective_from, '%Y-%m-%d') AS planEffectiveFrom,
        active_plan.schedule_days_json AS planScheduleDays,
        active_plan.schedule_anchor_page AS planScheduleAnchorPage,
        active_plan.schedule_anchor_surah AS planScheduleAnchorSurah,
        active_plan.schedule_anchor_ayah AS planScheduleAnchorAyah
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      LEFT JOIN student_quran_plans active_plan ON active_plan.student_id = s.id AND active_plan.status = 'active'
      ${studentWhere}
      ORDER BY COALESCE(c.name, 'بدون حلقة') ASC, s.name ASC
      `,
      studentParams
    );

    if (students.length === 0) {
    return {
      period: {
        from: startDate,
        to: endDate,
        sessionDates,
        committeeId: selectedCommitteeId,
        committeeName: selectedCommitteeId === 'all' ? 'كل الحلقات' : 'الحلقة المحددة',
        studentId: selectedStudentId,
        mode: startDate === endDate ? 'daily' : 'period',
        quranReferenceMode: settings.quranReferenceMode === 'page' ? 'page' : 'ayah',
      },
      rows: [],
    };
    }

    await ensureReportCurrentTasks({ startDate, today, endDate, students, reportDb, settings });

    const studentIds = students.map((student) => Number(student.id));
    const placeholders = studentIds.map(() => '?').join(', ');
    const [attendanceRows] = await reportDb.query(
      `
      SELECT
        student_id AS studentId,
        DATE_FORMAT(record_date, '%Y-%m-%d') AS recordDate,
        status
      FROM attendance_records
      WHERE student_id IN (${placeholders})
        AND record_date BETWEEN ? AND ?
      `,
      [...studentIds, startDate, endDate]
    );
    const [taskRows] = await reportDb.query(
      `
      SELECT
        t.id,
        t.student_id AS studentId,
        DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
        t.task_type AS taskType,
        t.track AS track,
        t.from_page AS fromPage,
        t.to_page AS toPage,
        t.from_surah AS fromSurah,
        t.from_ayah AS fromAyah,
        t.to_surah AS toSurah,
        t.to_ayah AS toAyah,
        t.target_pages AS targetPages,
        t.review_execution_json AS reviewExecution,
        ${quranRangeFacesSql('t', 'actual')} AS actualFaces,
        t.actual_to_page AS actualToPage,
        t.actual_to_surah AS actualToSurah,
        t.actual_to_ayah AS actualToAyah,
        fs.name_arabic AS fromSurahName,
        ts.name_arabic AS toSurahName,
        ts.ayah_count AS toSurahAyahCount,
        ats.name_arabic AS actualToSurahName,
        ats.ayah_count AS actualToSurahAyahCount,
        t.execution_state AS executionState,
        t.student_status AS studentStatus,
        t.teacher_rating_key AS teacherRatingKey,
        t.teacher_rating_label AS teacherRatingLabel,
        t.warning_count AS warningCount,
        t.mistake_count AS mistakeCount,
        t.evaluation_score AS evaluationScore,
        t.points,
        t.teacher_completed AS teacherCompleted,
        t.actual_repeat_count AS actualRepeatCount,
        t.actual_listening_count AS actualListeningCount
      FROM student_quran_tasks t
      JOIN student_quran_plans p ON p.id = t.plan_id
      LEFT JOIN quran_surahs fs ON fs.surah_number = t.from_surah
      LEFT JOIN quran_surahs ts ON ts.surah_number = t.to_surah
      LEFT JOIN quran_surahs ats ON ats.surah_number = t.actual_to_surah
      WHERE t.student_id IN (${placeholders})
        AND t.task_date BETWEEN ? AND ?
        AND t.task_type IN ('memorization', 'review', 'link', 'repeat')
      ORDER BY t.task_date ASC, FIELD(t.task_type, 'memorization', 'repeat', 'review', 'link'), t.from_page ASC
      `,
      [...studentIds, taskStartDate, endDate]
    );
    const [segmentRows] = await reportDb.query(
      `SELECT student_id AS studentId, plan_id AS planId, DATE_FORMAT(task_date, '%Y-%m-%d') AS taskDate,
        source_type AS sourceType, segment_type AS segmentType,
        SUM(amount_faces) AS amountFaces
       FROM student_quran_execution_segments
       WHERE student_id IN (${placeholders}) AND task_date BETWEEN ? AND ? AND is_current = 1
       GROUP BY student_id, plan_id, task_date, source_type, segment_type`,
      [...studentIds, startDate, endDate],
    );

    const attendanceByStudent = new Map();
    attendanceRows.forEach((row) => {
      if (!sessionDateSet.has(row.recordDate)) return;
      const key = String(row.studentId);
      if (!attendanceByStudent.has(key)) attendanceByStudent.set(key, []);
      attendanceByStudent.get(key).push(row);
    });

    const tasksByStudent = new Map();
    taskRows.forEach((task) => {
      const key = String(task.studentId);
      if (!tasksByStudent.has(key)) tasksByStudent.set(key, []);
      tasksByStudent.get(key).push(normalizeTaskRow(task, 'ayah'));
    });
    const segmentsByStudentDate = new Map();
    const authoritativeSources = new Map();
    segmentRows.forEach((segment) => {
      const executionKey = `${segment.studentId}:${segment.planId}:${segment.taskDate}`;
      if (segment.sourceType === 'teacher' || !authoritativeSources.has(executionKey)) authoritativeSources.set(executionKey, segment.sourceType);
    });
    segmentRows.forEach((segment) => {
      const executionKey = `${segment.studentId}:${segment.planId}:${segment.taskDate}`;
      if (authoritativeSources.get(executionKey) !== segment.sourceType) return;
      const key = `${segment.studentId}:${segment.taskDate}`;
      if (!segmentsByStudentDate.has(key)) segmentsByStudentDate.set(key, {});
      segmentsByStudentDate.get(key)[segment.segmentType] = {
        amountFaces: Number(segment.amountFaces || 0),
      };
    });

    const rows = await Promise.all(students.map(async (student) => {
      const studentStartDate = student.planCreatedDate || addUtcDays(endDate, 1);
      const studentSessionDates = sessionDates.filter((date) => date >= studentStartDate);
      const attendanceRecords = (attendanceByStudent.get(String(student.id)) || [])
        .filter((record) => record.recordDate >= studentStartDate);
      const attendanceCounts = attendanceRecords.reduce((acc, record) => {
        if (record.status === 'present') acc.present += 1;
        else if (record.status === 'late') acc.late += 1;
        else if (record.status === 'excused') acc.excused += 1;
        else if (record.status === 'absent') acc.absent += 1;
        return acc;
      }, { present: 0, late: 0, excused: 0, absent: 0 });
      const attended = attendanceCounts.present + attendanceCounts.late + attendanceCounts.excused;
      const expectedAttendance = studentSessionDates.length;

      const studentTasks = tasksByStudent.get(String(student.id)) || [];
      const tasks = Object.fromEntries(progressTaskTypes.map((type) => [type, emptyProgressTask()]));
      for (const type of progressTaskTypes) {
        const byDate = new Map();
        studentTasks.filter((task) => task.taskType === type && task.taskDate >= startDate && task.taskDate <= endDate).forEach((task) => {
          if (!byDate.has(task.taskDate)) byDate.set(task.taskDate, []);
          byDate.get(task.taskDate).push(task);
        });
        const details = [...byDate.entries()].map(([date, items]) => {
          const done = items.length > 0 && items.every((item) =>
            item.studentStatus === 'done' && item.teacherCompleted !== false && item.executionState !== 'partial'
          );
          return {
            date,
            done,
            amount: items.map((item) => item.actualPreview || item.preview).join('، '),
            items,
          };
        });
        tasks[type] = {
          expected: details.length,
          done: details.filter((detail) => detail.done).length,
          percentage: progressPercentage(details.filter((detail) => detail.done).length, details.length),
          details,
        };
      }

      const components = [
        progressPercentage(attended, expectedAttendance),
        ...progressScoredTaskTypes.map((type) => tasks[type].percentage),
      ].filter((value) => value !== null);

      const dailyDetails = [...new Set([
        ...studentSessionDates,
        ...studentTasks
          .filter((task) => task.taskDate >= startDate && task.taskDate <= endDate)
          .map((task) => task.taskDate),
      ])].sort((a, b) => a.localeCompare(b)).map((detailDate) => {
        const attendanceRecord = attendanceRecords.find((record) => record.recordDate === detailDate);
        const dateTasks = studentTasks.filter((task) => task.taskDate === detailDate);
        const taskItems = Object.fromEntries(progressTaskTypes.map((type) => [
          type,
          dateTasks.filter((task) => task.taskType === type),
        ]));
        const completedStandardTask = (task) => (
          task.studentStatus === 'done'
          && task.teacherCompleted !== false
          && task.executionState !== 'partial'
        );
        const memorizationItems = taskItems.memorization.filter((task) => task.track !== 'mastery');
        const masteryItems = taskItems.memorization.filter((task) => task.track === 'mastery');
        const acceptedMemorizationItems = memorizationItems.filter(isAcceptedMemorizationTask);
        const acceptedMasteryItems = masteryItems.filter(isAcceptedMemorizationTask);
        const completedRepeatItems = taskItems.repeat.filter(completedStandardTask);
        const memorization = completedTaskAmount(memorizationItems, isAcceptedMemorizationTask);
        const mastery = completedTaskAmount(masteryItems, isAcceptedMemorizationTask);
        const review = completedTaskAmount(taskItems.review, (task) => task.studentStatus === 'done');
        const _resolveMemorizationStatus = () => {
          if (memorizationItems.length === 0) {
            return 'no_plan';
          }
          if (acceptedMemorizationItems.length === 0) {
            return 'not_completed';
          }
          if (acceptedMemorizationItems.some((task) => task.executionState === 'partial')) {
            return 'partial';
          }
          return 'completed';
        };
        const _resolveMasteryStatus = () => {
          if (masteryItems.length === 0) {
            return 'no_plan';
          }
          if (acceptedMasteryItems.length === 0) {
            return 'not_completed';
          }
          if (acceptedMasteryItems.some((task) => task.executionState === 'partial')) {
            return 'partial';
          }
          return 'completed';
        };
        return {
          date: detailDate,
          attendanceStatus: attendanceRecord?.status || (sessionDateSet.has(detailDate) ? '' : 'no_session'),
          memorization,
          memorizationItems: acceptedMemorizationItems,
          memorizationStatus: _resolveMemorizationStatus(),
          mastery,
          masteryItems: acceptedMasteryItems,
          masteryStatus: _resolveMasteryStatus(),
          review,
          reviewItems: taskItems.review.filter((task) => task.studentStatus === 'done'),
          repeat: completedRepeatItems.length
            ? Math.max(...completedRepeatItems.map((task) => Number(task.actualRepeatCount || 0)))
            : null,
          listening: completedRepeatItems.length
            ? completedRepeatItems.some((task) => Number(task.actualListeningCount || 0) > 0)
            : null,
          link: completedTaskAmount(taskItems.link, completedStandardTask),
          linkItems: taskItems.link.filter(completedStandardTask),
          evaluation: taskItems.memorization
            .map((task) => task.teacherRatingLabel)
            .filter(Boolean)
            .join('، '),
          executionBreakdown: segmentsByStudentDate.get(`${student.id}:${detailDate}`) || {},
        };
      });

      const executionTotals = dailyDetails.reduce((totals, detail) => {
        for (const type of ['normal', 'compensation', 'extra']) {
          totals[type].amountFaces += Number(detail.executionBreakdown?.[type]?.amountFaces || 0);
        }
        return totals;
      }, {
        normal: { amountFaces: 0 },
        compensation: { amountFaces: 0 },
        extra: { amountFaces: 0 },
      });
      const activePlan = student.activePlanId ? {
        id: student.activePlanId,
        startPage: student.planStartPage,
        startSurah: student.planStartSurah,
        startAyah: student.planStartAyah,
        endPage: student.planEndPage,
        endSurah: student.planEndSurah,
        endAyah: student.planEndAyah,
        dailyPages: student.planDailyPages,
        nextMemorizationPage: student.planNextPage,
        nextMemorizationSurah: student.planNextSurah,
        nextMemorizationAyah: student.planNextAyah,
        startDate: student.planStartDate,
        effectiveFrom: student.planEffectiveFrom,
        scheduleDays: student.planScheduleDays,
        scheduleAnchorPage: student.planScheduleAnchorPage,
        scheduleAnchorSurah: student.planScheduleAnchorSurah,
        scheduleAnchorAyah: student.planScheduleAnchorAyah,
      } : null;
      const planProgress = activePlan
        ? await getPlanProgressSummary(
          reportDb,
          await getPlanProgressContext(reportDb, activePlan, today, settings),
        )
        : null;

      return {
        id: student.id,
        name: student.name,
        committeeName: student.committeeName,
        attendance: {
          expected: expectedAttendance,
          attended,
          late: attendanceCounts.late,
          excused: attendanceCounts.excused,
          absent: Math.max(0, expectedAttendance - attended),
          percentage: progressPercentage(attended, expectedAttendance),
        },
        tasks,
        saved: {
          memorization: [...new Set(dailyDetails.map((item) => item.memorization).filter(Boolean))].join('، '),
          mastery: [...new Set(dailyDetails.map((item) => item.mastery).filter(Boolean))].join('، '),
          review: [...new Set(dailyDetails.map((item) => item.review).filter(Boolean))].join('، '),
        },
        dailyDetails,
        executionTotals,
        planProgress,
        overallPercentage: components.length
          ? Math.round(components.reduce((sum, value) => sum + value, 0) / components.length)
          : 0,
      };
    }));

  return {
      period: {
        from: startDate,
        to: endDate,
        sessionDates,
      committeeId: selectedCommitteeId,
      committeeName: selectedCommitteeId === 'all' ? 'كل الحلقات' : (students[0]?.committeeName || 'الحلقة المحددة'),
      studentId: selectedStudentId,
      mode: startDate === endDate ? 'daily' : 'period',
      quranReferenceMode: settings.quranReferenceMode === 'page' ? 'page' : 'ayah',
      },
      rows,
  };
}

/** Bind the authenticated supervisor identity when restricting report students to assigned committees. */
function restrictProgressReportToTeacher(auth, studentFilters, studentParams) {
  if (auth?.role === 'supervisor') {
    studentFilters.push(`EXISTS (
        SELECT 1 FROM supervisor_committees sc
        WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id
      )`);
    studentParams.push(auth.id);
  }
}

/** Prepare only active local plans when the requested report includes today. */
async function ensureReportCurrentTasks({ startDate, today, endDate, students, reportDb, settings }) {
  if (startDate <= today && endDate >= today) {
    for (const student of students) {
      if (!student.activePlanId) continue;
      const activePlan = await getActivePlanForStudent(reportDb, student.id);
      await ensureStudentPlanTasks(reportDb, activePlan, today, settings);
    }
  }
}

function resolvePdfFontPair() {
  const candidates = [
    {
      regular: `${process.cwd()}/public/fonts/cairo/cairo-400.ttf`,
      bold: `${process.cwd()}/public/fonts/cairo/cairo-700.ttf`,
    },
    {
      regular: `${process.cwd()}/../dist/fonts/cairo/cairo-400.ttf`,
      bold: `${process.cwd()}/../dist/fonts/cairo/cairo-700.ttf`,
    },
    {
      regular: `${nodePath.resolve(process.cwd(), '../dist')}/fonts/cairo/cairo-400.ttf`,
      bold: `${nodePath.resolve(process.cwd(), '../dist')}/fonts/cairo/cairo-700.ttf`,
    },
    {
      regular: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      bold: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    },
    {
      regular: 'C:/Windows/Fonts/segoeui.ttf',
      bold: 'C:/Windows/Fonts/segoeuib.ttf',
    },
  ];
  return candidates.find((candidate) =>
    nodeFs.existsSync(candidate.regular) && nodeFs.existsSync(candidate.bold)
  ) || null;
}

async function buildProgressPdf(report) {
  return await new Promise((resolve, reject) => {
    const { doc, regularFont, boldFont } = createBufferedPdf({ size: 'A4', layout: 'landscape', margin: 24, bufferPages: true }, resolvePdfFontPair(), resolve, reject);
    doc.font(regularFont);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const pageX = 24;
    const contentWidth = pageWidth - (pageX * 2);
    const primary = '#00ad9f';
    const primaryDark = '#057f75';
    const background = '#eff9fc';
    const panel = '#ffffff';
    const softPanel = '#f8fdff';
    const border = '#b6e3ef';
    const text = '#0f172a';
    const muted = '#64748b';
    const success = '#16a34a';
    const amber = '#d97706';
    const totalStudents = report.rows.length;
    const averagePercentage = totalStudents
      ? Math.round(report.rows.reduce((sum, row) => sum + Number(row.overallPercentage || 0), 0) / totalStudents)
      : 0;
    const attendanceDone = report.rows.reduce((sum, row) => sum + Number(row.attendance?.attended || 0), 0);
    const attendanceExpected = report.rows.reduce((sum, row) => sum + Number(row.attendance?.expected || 0), 0);
    const periodLabel = `${report.period.from} إلى ${report.period.to}`;
    const writeText = (value, x, y, options = {}) => {
      const {
        width,
        align = 'right',
        size = 10,
        color = text,
        font = regularFont,
        lineGap = 0,
        height,
      } = options;
      const textValue = String(value ?? '');
      doc.fillColor(color).font(font).fontSize(size);
      const textHeight = height ?? Math.max(size + lineGap + 3, 8);
      if (width && /[\u0600-\u06FF]/.test(textValue)) {
        const words = textValue.trim().split(/\s+/).filter(Boolean);
        const gap = Math.max(3, size * 0.4);
        const widths = words.map((word) => doc.widthOfString(word));
        const phraseWidth = widths.reduce((sum, itemWidth) => sum + itemWidth, 0) + (Math.max(words.length - 1, 0) * gap);
        const _resolveCursor = () => {
          if (align === 'center') {
            return x + ((width + Math.min(phraseWidth, width)) / 2);
          }
          if (align === 'left') {
            return x + Math.min(phraseWidth, width);
          }
          return x + width;
        };
        let cursor = _resolveCursor();
        for (let index = 0; index < words.length; index += 1) {
          const wordWidth = widths[index];
          if (cursor - wordWidth < x) break;
          doc.text(words[index], cursor - wordWidth, y, {
            width: wordWidth + 1,
            align: 'left',
            lineGap,
            height: textHeight,
            ellipsis: false,
            lineBreak: false,
          });
          cursor -= wordWidth + gap;
        }
        return;
      }
      doc.text(textValue, x, y, {
        width,
        align,
        lineGap,
        height: textHeight,
        ellipsis: true,
        lineBreak: false,
      });
    };

    const drawPageBase = () => {
      doc.rect(0, 0, pageWidth, pageHeight).fill(background);
      doc.fillColor('#d8eef5').opacity(0.35).circle(pageWidth - 46, 48, 82).fill();
      doc.fillColor('#b9e4ef').opacity(0.28).circle(44, pageHeight - 34, 96).fill();
      doc.opacity(1);
    };

    const drawHeader = () => {
      drawPageBase();
      doc.roundedRect(pageX, 18, contentWidth, 54, 13).fill(panel).stroke(border);
      doc.roundedRect(pageX + contentWidth - 168, 30, 136, 28, 9).fill(primary);
      writeText('متابعة الطلاب', pageX + contentWidth - 162, 36, { width: 124, align: 'center', size: 14, color: '#ffffff', font: boldFont });
      doc.roundedRect(pageX + 20, 31, 78, 24, 8).fill('#e6f7fb').stroke('#caedf5');
      writeText(currentSiteConfig().name, pageX + 26, 36, { width: 66, align: 'center', size: 9.5, color: primaryDark, font: boldFont });
      writeText('الفترة', pageX + contentWidth - 348, 27, { width: 54, size: 8, color: muted, font: boldFont });
      writeText(periodLabel, pageX + contentWidth - 508, 27, { width: 154, size: 9, color: text, font: boldFont });
      writeText('الحلقة', pageX + contentWidth - 348, 49, { width: 54, size: 8, color: muted, font: boldFont });
      writeText(report.period.committeeName || 'كل الحلقات', pageX + contentWidth - 508, 49, { width: 154, size: 9, color: text, font: boldFont });

      const cardWidth = 140;
      const cardTop = 82;
      const metrics = [
        ['الطلاب', totalStudents, primary],
        ['الإنجاز', `${averagePercentage}%`, success],
        ['الحضور', reportRatio(attendanceDone, attendanceExpected), amber],
      ];
      metrics.forEach(([label, value, color], index) => {
        const x = pageX + contentWidth - cardWidth - (index * (cardWidth + 10));
        doc.roundedRect(x, cardTop, cardWidth, 34, 10).fill(panel).stroke('#d2eef6');
        doc.roundedRect(x + cardWidth - 15, cardTop + 7, 4, 20, 3).fill(color);
        writeText(label, x + 16, cardTop + 6, { width: cardWidth - 34, size: 8, color: muted, font: boldFont });
        writeText(value, x + 16, cardTop + 19, { width: cardWidth - 34, size: 11, color: text, font: boldFont });
      });
    };
    drawHeader();

    const rowHeight = 21;
    const columns = [
      { label: 'النسبة', width: 54, value: (row) => `${Number(row.overallPercentage || 0)}%`, strong: true },
      { label: 'الربط', width: 50, value: (row) => formatReportFaces(getTaskSummary(row, 'link', false).faces) },
      { label: 'التكرار', width: 50, value: (row) => reportRatio(row.tasks?.repeat?.done, row.tasks?.repeat?.expected) },
      { label: 'المراجعة', width: 130, value: (row) => formatReportFaces(getTaskSummary(row, 'review', false).faces) },
      { label: 'المحفوظ', width: 150, value: (row) => formatReportFaces(getTaskSummary(row, 'memorization', false, null, 'memorization').faces) },
      { label: 'الحضور', width: 62, value: (row) => reportRatio(row.attendance?.attended, row.attendance?.expected) },
      { label: 'النقص', width: 60, value: (row) => `${Number(row.planProgress?.shortageFaces || 0)} وجه` },
      { label: 'الطالب', width: contentWidth - 556, value: (row) => row.name, align: 'right', student: true },
    ];

    let y = 128;
    const drawTableHeader = () => {
      let x = pageX;
      doc.roundedRect(pageX, y, contentWidth, 22, 8).fill('#dff4fa').stroke('#bddfeb');
      columns.forEach((column) => {
        writeText(column.label, x + 8, y + 7, {
          width: column.width - 16,
          align: column.align || 'center',
          size: 8.4,
          color: text,
          font: boldFont,
        });
        x += column.width;
      });
      y += 26;
    };
    drawTableHeader();

    report.rows.forEach((row, index) => {
      if (y + rowHeight + 18 > pageHeight - 32) {
        doc.addPage();
        drawHeader();
        y = 128;
        drawTableHeader();
      }
      let x = pageX;
      doc.roundedRect(pageX, y, contentWidth, rowHeight, 12).fill(index % 2 ? panel : softPanel).stroke('#d9edf4');
      columns.forEach((column) => {
        if (column.student) {
          writeText(row.name || '-', x + 12, y + 9, {
            width: column.width - 24,
            align: 'right',
            size: 8.8,
            color: text,
            font: boldFont,
            height: 14,
          });
          writeText(row.committeeName || 'بدون حلقة', x + 12, y + 17, {
            width: column.width - 24,
            align: 'right',
            size: 7,
            color: muted,
            font: regularFont,
            height: 10,
          });
        } else {
          const value = String(column.value(row) ?? '-');
          const isStrong = column.strong;
          if (isStrong) {
            doc.roundedRect(x + 10, y + 7, column.width - 20, 20, 7).fill('#e6f7fb').stroke('#c9eaf3');
          }
          writeText(value, x + 8, y + 7, {
            width: column.width - 16,
            align: 'center',
            size: isStrong ? 8.4 : 8.2,
            color: isStrong ? primaryDark : text,
            font: isStrong ? boldFont : regularFont,
            height: 14,
          });
        }
        x += column.width;
      });
      y += rowHeight + 2;
    });

    if (report.rows.length === 0) {
      doc.roundedRect(pageX, y, contentWidth, 92, 14).fill(panel).stroke(border);
      writeText('لا توجد بيانات ضمن الفترة المحددة.', pageX, y + 34, { width: contentWidth, align: 'center', size: 17, color: muted, font: boldFont });
    }

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      writeText(`صفحة ${index + 1} من ${range.count}`, pageX, pageHeight - 26, {
        width: contentWidth,
        align: 'center',
        size: 9,
        color: muted,
        font: regularFont,
      });
    }

    doc.end();
  });
}

async function buildProgressExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.name;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('متابعة الطلاب');
  sheet.columns = reportColumns.map((column) => ({ key: column.key, width: column.width }));
  sheet.addRow(reportColumns.map((column) => column.label));
  report.rows.forEach((row) => {
    const values = getReportRowValues(row);
    sheet.addRow(reportColumns.map((column) => values[column.key]));
  });
  const average = report.rows.length
    ? report.rows.reduce((sum, row) => sum + Number(row.overallPercentage || 0), 0) / report.rows.length / 100
    : 0;
  const attendanceDone = report.rows.reduce((sum, row) => sum + Number(row.attendance?.attended || 0), 0);
  styleModernReportSheet(sheet, {
    title: 'متابعة الطلاب',
    subtitle: `${currentSiteConfig().name} | ${report.period.committeeName} | من ${report.period.from} إلى ${report.period.to}`,
    widths: reportColumns.map((column) => column.width),
    summary: [
      ['الطلاب', report.rows.length],
      ['متوسط الإنجاز', average],
      ['إجمالي الحضور', attendanceDone],
    ],
    percentageColumns: [10],
    rightAlignedColumns: [1, 2],
  });
  sheet.getRow(5).getCell(2).numFmt = '0%';
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const recitationSessionColumns = [
  { key: 'studentName', label: 'الطالب', width: 26 },
  { key: 'committeeName', label: 'الحلقة', width: 22 },
  { key: 'sessionDate', label: 'تاريخ الجلسة', width: 14 },
  { key: 'attemptNumber', label: 'المحاولة', width: 10 },
  { key: 'taskTypeLabel', label: 'النوع', width: 12 },
  { key: 'preview', label: 'المقدار', width: 38 },
  { key: 'executionBreakdown', label: 'تصنيف التنفيذ', width: 32 },
  { key: 'mistakeCount', label: 'الأخطاء', width: 10 },
  { key: 'warningCount', label: 'التنبيهات', width: 12 },
  { key: 'score', label: 'الدرجة', width: 12 },
  { key: 'ayahTexts', label: 'التحديدات والملاحظات', width: 70 },
  { key: 'teacherName', label: 'المعلم', width: 22 },
  { key: 'statusLabel', label: 'الحالة', width: 14 },
];

function getRecitationAyahTexts(row) {
  const seen = new Set();
  return (Array.isArray(row.ayahMarks) ? row.ayahMarks : [])
    .map((mark) => {
      const text = String(mark.selectedText || mark.textUthmani || '').trim();
      const notes = String(mark.notes || '').trim();
      return notes ? `${text}\nملاحظة: ${notes}` : text;
    })
    .filter((text) => text && !seen.has(text) && seen.add(text))
    .join('\n');
}

const recitationTaskLabels = {
  memorization: 'حفظ',
  mastery: 'إتقان',
  review: 'مراجعة',
  link: 'ربط',
  repeat: 'تكرار',
};

const recitationReportFileName = (report, extension) => {
  const committee = String(report.period?.committeeName || 'كل الحلقات')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'جلسات-التسميع';
  return `جلسات-التسميع-${committee}-${report.period.from}-إلى-${report.period.to}.${extension}`;
};

const countRecitationSessions = (rows = []) => new Set(
  rows.map((row) => String(row.sessionId || `attempt:${row.id}`))
).size;

function getRecitationRowValues(row) {
  const _resolveExecutionBreakdown = () => {
    if (row.taskType === 'memorization') {
      return `السماع: ${Number(row.actualListeningCount || 0) > 0 ? 'نعم' : 'لا'}`;
    }
    return '';
  };
  const executionBreakdown = [
    Number(row.normalFaces || 0) ? `طبيعي: ${Number(row.normalFaces)} وجه` : '',
    Number(row.compensationFaces || 0) ? `تعويض: ${Number(row.compensationFaces)} وجه` : '',
    Number(row.extraFaces || 0) ? `زيادة: ${Number(row.extraFaces)} وجه` : '',
    row.taskType === 'memorization' ? `التكرار: ${Number(row.actualRepeatCount || 0)}` : '',
    _resolveExecutionBreakdown(),
  ].filter(Boolean).join('، ');
  return {
    studentName: row.studentName,
    committeeName: row.committeeName || 'بدون حلقة',
    sessionDate: row.sessionDate,
    attemptNumber: Number(row.attemptNumber || 1),
    normalFaces: Number(row.normalFaces || 0),
    compensationFaces: Number(row.compensationFaces || 0),
    extraFaces: Number(row.extraFaces || 0),
    taskTypeLabel: row.taskType === 'memorization'
      ? (row.trackLabel || recitationTaskLabels.memorization)
      : (recitationTaskLabels[row.taskType] || row.taskType),
    preview: row.preview || '-',
    executionBreakdown: executionBreakdown || '-',
    mistakeCount: Number(row.mistakeCount || 0),
    warningCount: Number(row.warningCount || 0),
    score: row.evaluationScore === null || row.evaluationScore === undefined
      ? '-'
      : `${Number(row.evaluationScore).toFixed(2)} / ${Number(row.evaluationMaxScore || 100).toFixed(2)}`,
    ayahTexts: getRecitationAyahTexts(row),
    teacherName: row.teacherName || '-',
    statusLabel: getRecitationStatusLabel(row),
  };
}

async function buildRecitationSessionsReport({ from, startDate: requestedStartDate, date, to, endDate: requestedEndDate, committeeId = 'all', studentId = null, studentHistory = false, auth = null } = {}) {
  const isStudentHistory = studentHistory === true && Number.isSafeInteger(Number(studentId)) && Number(studentId) > 0;
  const today = getSaudiDateTimeParts().date;
  const startDate = String(from || requestedStartDate || date || await getFirstRecitationSessionReportDate(db()));
  const endDate = String(to || requestedEndDate || date || today);
  const selectedCommitteeId = String(committeeId || 'all');
  assertReportDateRange(startDate, endDate);
  if (!isStudentHistory && getDatesInRange(startDate, endDate).length > 370) {
    const error = new Error('اختر نطاقاً لا يتجاوز سنة واحدة.');
    error.status = 422;
    throw error;
  }
  if (!isStudentHistory) await markExpiredPendingQuranTasks(db(), today);
  const settings = await loadSettings();

  const filters = [
    "t.task_type IN ('memorization', 'review', 'link')",
    'a.session_date BETWEEN ? AND ?',
  ];
  const params = [startDate, endDate];
  if (selectedCommitteeId !== 'all') {
    filters.push('s.committee_id = ?');
    params.push(selectedCommitteeId);
  }
  if (isStudentHistory) { filters.push('s.id = ?', 'a.is_official = 1'); params.push(Number(studentId)); }
  if (auth?.role === 'supervisor') {
    if (!isStudentHistory) { filters.push('a.evaluator_id = ?'); params.push(auth.id); }
    filters.push(`EXISTS (
      SELECT 1 FROM supervisor_committees sc
      WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id
    )`);
    params.push(auth.id);
  }

  const [rows] = await db().query(
    `
    SELECT
      a.id,
      COALESCE(a.session_id, SUBSTRING_INDEX(a.request_id, ':', 1), CONCAT('attempt:', a.id)) AS sessionId,
      a.evaluator_id AS evaluatorId,
      t.id AS taskId,
      a.attempt_number AS attemptNumber,
      t.plan_id AS planId,
      t.student_id AS studentId,
      s.name AS studentName,
      c.name AS committeeName,
      DATE_FORMAT(a.session_date, '%Y-%m-%d') AS sessionDate,
      DATE_FORMAT(t.task_date, '%Y-%m-%d') AS taskDate,
      t.task_type AS taskType,
        t.track AS track,
      t.from_page AS fromPage,
      t.to_page AS toPage,
      t.from_surah AS fromSurah,
      t.from_ayah AS fromAyah,
      t.to_surah AS toSurah,
      t.to_ayah AS toAyah,
      qsf.name_arabic AS fromSurahName,
      qst.name_arabic AS toSurahName,
      t.target_pages AS targetPages,
        t.review_execution_json AS reviewExecution,
      t.actual_to_page AS actualToPage,
      t.actual_to_surah AS actualToSurah,
      t.actual_to_ayah AS actualToAyah,
      t.execution_state AS executionState,
      t.student_status AS studentStatus,
      t.teacher_rating_key AS teacherRatingKey,
      t.teacher_rating_label AS teacherRatingLabel,
      a.warning_count AS warningCount,
      a.mistake_count AS mistakeCount,
      a.evaluation_score AS evaluationScore,
      a.evaluation_max_score AS evaluationMaxScore,
      t.points,
      (SELECT COALESCE(MAX(repeatTask.actual_repeat_count), 0)
       FROM student_quran_tasks repeatTask
       WHERE repeatTask.plan_id = t.plan_id AND repeatTask.student_id = t.student_id
         AND repeatTask.task_date = t.task_date AND repeatTask.task_type = 'repeat' AND repeatTask.track = t.track
         AND repeatTask.from_surah = t.from_surah AND repeatTask.from_ayah = t.from_ayah
         AND repeatTask.to_surah = t.to_surah AND repeatTask.to_ayah = t.to_ayah) AS actualRepeatCount,
      (SELECT COALESCE(MAX(repeatTask.actual_listening_count), 0)
       FROM student_quran_tasks repeatTask
       WHERE repeatTask.plan_id = t.plan_id AND repeatTask.student_id = t.student_id
         AND repeatTask.task_date = t.task_date AND repeatTask.task_type = 'repeat' AND repeatTask.track = t.track
         AND repeatTask.from_surah = t.from_surah AND repeatTask.from_ayah = t.from_ayah
         AND repeatTask.to_surah = t.to_surah AND repeatTask.to_ayah = t.to_ayah) AS actualListeningCount,
      (SELECT COALESCE(SUM(seg.amount_faces), 0) FROM student_quran_execution_segments seg
       WHERE seg.source_id = a.id AND seg.segment_type = 'normal'
         AND seg.source_type = 'teacher' AND seg.is_current = 1) AS normalFaces,
      (SELECT COALESCE(SUM(seg.amount_faces), 0) FROM student_quran_execution_segments seg
       WHERE seg.source_id = a.id AND seg.segment_type = 'compensation'
         AND seg.source_type = 'teacher' AND seg.is_current = 1) AS compensationFaces,
      (SELECT COALESCE(SUM(seg.amount_faces), 0) FROM student_quran_execution_segments seg
       WHERE seg.source_id = a.id AND seg.segment_type = 'extra'
         AND seg.source_type = 'teacher' AND seg.is_current = 1) AS extraFaces,
      a.teacher_completed AS teacherCompleted,
      a.ayah_marks_json AS ayahMarksJson,
      a.word_marks_json AS wordMarksJson,
      sp.name AS teacherName,
      DATE_FORMAT(a.evaluated_at, '%Y-%m-%d %H:%i') AS evaluatedAt
    FROM student_quran_recitation_attempts a
    JOIN student_quran_tasks t ON t.id = a.task_id
    JOIN students s ON s.id = t.student_id
    LEFT JOIN committees c ON c.id = s.committee_id
    LEFT JOIN quran_surahs qsf ON qsf.surah_number = t.from_surah
    LEFT JOIN quran_surahs qst ON qst.surah_number = t.to_surah
    LEFT JOIN supervisors sp ON sp.id = a.evaluator_id
    WHERE a.is_official = 1 AND ${filters.join(' AND ')}
    ORDER BY a.evaluated_at DESC, a.id DESC, COALESCE(c.name, 'بدون حلقة') ASC, s.name ASC
    `,
    params
  );

  const taskIds = [...new Set(rows.map((row) => Number(row.taskId)).filter(Boolean))];
  const historicalMarksByTaskDate = new Map();
  await loadHistoricalRecitationMarks(isStudentHistory, taskIds, startDate, endDate, historicalMarksByTaskDate);
  const normalizedRows = rows.map((row) => {
    const ayahMarks = parseStoredWordMarks(row.ayahMarksJson);
    const wordMarks = parseStoredWordMarks(row.wordMarksJson);
    const currentMarks = wordMarks.length ? wordMarks : ayahMarks;
    const historicalMarks = historicalMarksByTaskDate.get(`${Number(row.taskId)}:${row.sessionDate}`);
    const _resolveDisplayMarks = () => {
      if (isStudentHistory) {
        return currentMarks;
      }
      if (currentMarks.length) {
        return currentMarks;
      }
      return historicalMarks?.marks || [];
    };
    const displayMarks = _resolveDisplayMarks();
    const detailedWarningCount = displayMarks.reduce((sum, mark) => (
      sum + (mark.markType === 'warning' ? Number(mark.count || 1) : Number(mark.warningCount || 0))
    ), 0);
    const detailedMistakeCount = displayMarks.reduce((sum, mark) => (
      sum + (isMistakeMark(mark.markType) ? Number(mark.count || 1) : Number(mark.mistakeCount || 0))
    ), 0);
    return {
      ...normalizeTaskRow(row, settings.quranReferenceMode),
      taskId: Number(row.taskId),
      sessionId: row.sessionId,
      evaluatorId: Number(row.evaluatorId),
      sessionDate: row.sessionDate,
      taskDate: row.taskDate,
      teacherName: row.teacherName || 'المعلم',
      evaluatedAt: row.evaluatedAt || '',
      attemptNumber: Number(row.attemptNumber || 1),
      warningCount: currentMarks.length ? detailedWarningCount : Number(row.warningCount || 0),
      mistakeCount: currentMarks.length ? detailedMistakeCount : Number(row.mistakeCount || 0),
      ayahMarks: displayMarks,
      wordMarks,
      marksFromPreviousAttempt: !currentMarks.length
        && displayMarks.length > 0
        && Number(historicalMarks?.attemptId) !== Number(row.id),
    };
  });

  const committeeName = selectedCommitteeId === 'all'
    ? 'كل الحلقات'
    : (normalizedRows[0]?.committeeName || 'الحلقة المحددة');
  return {
    period: {
      from: startDate,
      to: endDate,
      committeeId: selectedCommitteeId,
      committeeName,
    },
    rows: normalizedRows,
  };
}

/** Load historical marks once for the report task group with bound identifiers. */
async function loadHistoricalRecitationMarks(isStudentHistory, taskIds, startDate, endDate, historicalMarksByTaskDate) {
  if (!isStudentHistory && taskIds.length) {
    const [historicalMarkRows] = await db().query(
      `SELECT id, task_id AS taskId, DATE_FORMAT(session_date, '%Y-%m-%d') AS sessionDate,
        ayah_marks_json AS ayahMarksJson, word_marks_json AS wordMarksJson
       FROM student_quran_recitation_attempts
       WHERE task_id IN (?)
         AND session_date BETWEEN ? AND ?
         AND (JSON_LENGTH(ayah_marks_json) > 0 OR JSON_LENGTH(word_marks_json) > 0)
       ORDER BY evaluated_at DESC, id DESC`,
      [taskIds, startDate, endDate]
    );
    for (const markRow of historicalMarkRows) {
      const key = `${Number(markRow.taskId)}:${markRow.sessionDate}`;
      if (historicalMarksByTaskDate.has(key)) continue;
      const ayahMarks = parseStoredWordMarks(markRow.ayahMarksJson);
      const wordMarks = parseStoredWordMarks(markRow.wordMarksJson);
      historicalMarksByTaskDate.set(key, {
        attemptId: Number(markRow.id),
        marks: wordMarks.length ? wordMarks : ayahMarks,
      });
    }
  }
}

async function buildRecitationSessionsExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.name;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('جلسات التسميع');
  sheet.columns = recitationSessionColumns.map((column) => ({ key: column.key, width: column.width }));
  sheet.addRow(recitationSessionColumns.map((column) => column.label));
  report.rows.forEach((row) => {
    const values = getRecitationRowValues(row);
    sheet.addRow(recitationSessionColumns.map((column) => values[column.key]));
  });
  styleModernReportSheet(sheet, {
    title: 'تقرير جلسات التسميع',
    subtitle: `${currentSiteConfig().name} | ${report.period.committeeName} | من ${report.period.from} إلى ${report.period.to}`,
    widths: recitationSessionColumns.map((column) => column.width),
    summary: [
      ['الجلسات', countRecitationSessions(report.rows)],
      ['المتقن', report.rows.filter((row) => getRecitationStatusLabel(row) === 'متقن').length],
      ['يحتاج إعادة', report.rows.filter((row) => getRecitationStatusLabel(row) === 'يحتاج إعادة').length],
      ['لم يُستكمل', report.rows.filter((row) => getRecitationStatusLabel(row) === 'لم يُستكمل').length],
    ],
    statusColumn: 11,
    rightAlignedColumns: [1, 2, 6, 9, 10],
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildRecitationSessionsPdf(report) {
  return await new Promise((resolve, reject) => {
    const { doc, regularFont, boldFont } = createBufferedPdf({ size: 'A4', layout: 'landscape', margin: 24, bufferPages: true }, resolvePdfFontPair(), resolve, reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 28;
    const contentWidth = pageWidth - (margin * 2);
    const { primary, background, panel, softPanel, border, text, muted } = REPORT_PDF_COLORS;

    const write = createCompactPdfWriter(doc, regularFont, text);

    const drawBase = () => {
      doc.rect(0, 0, pageWidth, pageHeight).fill(background);
      doc.roundedRect(margin, 20, contentWidth, 58, 14).fill(panel).stroke(border);
      write('تقرير جلسات التسميع', margin + contentWidth - 292, 34, { width: 260, size: 17, color: primary, font: boldFont });
      write(`${report.period.committeeName} | من ${report.period.from} إلى ${report.period.to}`, margin + 34, 56, { width: contentWidth - 68, size: 9.5, color: muted, font: boldFont });
    };

    const columns = [
      { label: 'الحالة', width: 70, value: (row) => getRecitationStatusLabel(row) },
      { label: 'تنبيهات', width: 45, value: (row) => row.warningCount },
      { label: 'أخطاء', width: 45, value: (row) => row.mistakeCount },
      { label: 'التحديدات والملاحظات', width: 135, value: (row) => getRecitationAyahTexts(row) || '-' },
      { label: 'التصنيف', width: 100, value: (row) => getRecitationRowValues(row).executionBreakdown },
      { label: 'المقدار', width: 110, value: (row) => row.preview || '-' },
      { label: 'المحاولة', width: 45, value: (row) => row.attemptNumber || 1 },
      { label: 'التاريخ', width: 70, value: (row) => row.sessionDate },
      { label: 'الحلقة', width: 90, value: (row) => row.committeeName || 'بدون حلقة' },
      { label: 'الطالب', width: contentWidth - 710, value: (row) => row.studentName || '-' },
    ];

    let y = 94;
    const drawHeader = () => {
      let x = margin;
      doc.roundedRect(margin, y, contentWidth, 24, 8).fill('#dff4fa').stroke('#bddfeb');
      columns.forEach((column) => {
        write(column.label, x + 6, y + 7, { width: column.width - 12, align: 'center', size: 8.5, font: boldFont });
        x += column.width;
      });
      y += 30;
    };

    drawBase();
    drawHeader();
    report.rows.forEach((row, index) => {
      if (y + 26 > pageHeight - 28) {
        doc.addPage();
        drawBase();
        y = 94;
        drawHeader();
      }
      let x = margin;
      doc.roundedRect(margin, y, contentWidth, 23, 7).fill(index % 2 ? panel : softPanel).stroke('#d9edf4');
      columns.forEach((column) => {
        write(column.value(row), x + 6, y + 7, {
          width: column.width - 12,
          align: column.label === 'الآيات' || column.label === 'المقدار' || column.label === 'الطالب' || column.label === 'الحلقة' ? 'right' : 'center',
          size: 8,
          font: column.label === 'الطالب' ? boldFont : regularFont,
        });
        x += column.width;
      });
      y += 27;
    });
    if (report.rows.length === 0) {
      doc.roundedRect(margin, y, contentWidth, 82, 14).fill(panel).stroke(border);
      write('لا توجد جلسات تسميع ضمن الفترة المحددة.', margin, y + 31, { width: contentWidth, align: 'center', size: 16, color: muted, font: boldFont });
    }
    doc.end();
  });
}

const studentSavedColumns = [
  { key: 'studentName', label: 'الطالب', width: 26 },
  { key: 'committeeName', label: 'الحلقة', width: 20 },
  { key: 'memorizationRange', label: 'كامل المحفوظ', width: 94 },
];

const studentSavedReportFileName = (report, extension) => {
  const committee = String(report.period?.committeeName || 'كل الحلقات')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'محفوظ-الطلاب';
  return `محفوظ-الطلاب-${committee}.${extension}`;
};

function formatMemorizedSize(mergedRanges, juzRanges, totalFaces) {
  const completedJuzCount = juzRanges.filter((juz) => mergedRanges.some((range) => (
    compareQuranPosition(getQuranRangeStart(range), { page: juz.startPage, surah: juz.startSurah, ayah: juz.startAyah }) <= 0
    && compareQuranPosition(getQuranRangeEnd(range), { page: juz.endPage, surah: juz.endSurah, ayah: juz.endAyah }) >= 0
  ))).length;
  if (completedJuzCount > 0) {
    const _resolveUnit = () => {
      if (completedJuzCount === 1) {
        return 'جزء';
      }
      if (completedJuzCount === 2) {
        return 'جزآن';
      }
      return 'أجزاء';
    };
    const unit = _resolveUnit();
    return `${completedJuzCount.toLocaleString('ar-SA')} ${unit}`;
  }
  return `${Number(totalFaces || 0).toLocaleString('ar-SA')} وجه`;
}

async function enrichQuranRangeLabels(connection, range, referenceMode = 'ayah') {
  const [[fromSurah], [toSurah]] = await Promise.all([
    connection.query('SELECT name_arabic AS name FROM quran_surahs WHERE surah_number = ? LIMIT 1', [range.startSurah]).then(([rows]) => rows),
    connection.query('SELECT name_arabic AS name FROM quran_surahs WHERE surah_number = ? LIMIT 1', [range.endSurah]).then(([rows]) => rows),
  ]);
  const fromName = fromSurah?.name || `سورة ${range.startSurah}`;
  const toName = toSurah?.name || `سورة ${range.endSurah}`;
  const pageRange = range.startPage === range.endPage
    ? `صفحة ${range.startPage}`
    : `من صفحة ${range.startPage} إلى ${range.endPage}`;
  const surahRange = formatTaskPreview({
    fromSurah: range.startSurah,
    fromAyah: range.startAyah,
    fromSurahName: fromName,
    toSurah: range.endSurah,
    toAyah: range.endAyah,
    toSurahName: toName,
    fromPage: range.startPage,
    toPage: range.endPage,
  });
  return {
    ...range,
    fromSurahName: fromName,
    toSurahName: toName,
    pageRange,
    surahRange,
    displayRange: referenceMode === 'page' ? pageRange : surahRange,
    pagesCount: Math.max(0, Number(range.endPage || 0) - Number(range.startPage || 0) + 1),
  };
}

async function buildStudentSavedReport({ from = '', to = '', committeeId = 'all', studentId = 'all', auth = null } = {}) {
  const connection = await db().getConnection();
  try {
    const today = getSaudiDateTimeParts().date;
    const requestedStartDate = String(from || '');
    const endDate = String(to || today);
    const selectedCommitteeId = String(committeeId || 'all');
    const selectedStudentId = String(studentId || 'all');
    if ((requestedStartDate && !isValidDateOnly(requestedStartDate)) || !isValidDateOnly(endDate)) {
      const error = new Error('صيغة التاريخ غير صحيحة.');
      error.status = 422;
      throw error;
    }
    await markExpiredPendingQuranTasks(connection, today);

    const filters = [];
    const params = [];
    if (selectedCommitteeId !== 'all') {
      filters.push('s.committee_id = ?');
      params.push(selectedCommitteeId);
    }
    if (selectedStudentId !== 'all') {
      filters.push('s.id = ?');
      params.push(selectedStudentId);
    }
    if (auth?.role === 'supervisor') {
      filters.push(`EXISTS (
        SELECT 1 FROM supervisor_committees sc
        WHERE sc.supervisor_id = ? AND sc.committee_id = s.committee_id
      )`);
      params.push(auth.id);
    }
    const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
    const [students] = await connection.query(
      `
      SELECT s.id, s.name, c.name AS committeeName
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      ${where}
      ORDER BY COALESCE(c.name, 'بدون حلقة') ASC, s.name ASC
      `,
      params
    );

    let startDate = requestedStartDate;
    if (!startDate) {
      const studentIds = students.map((student) => Number(student.id)).filter(Boolean);
      if (studentIds.length > 0) {
        const [[firstPlan]] = await connection.query(
          `
          SELECT DATE_FORMAT(MIN(created_at), '%Y-%m-%d') AS firstDate
          FROM student_quran_plans
          WHERE student_id IN (${studentIds.map(() => '?').join(',')})
          `,
          studentIds
        );
        startDate = firstPlan?.firstDate || endDate;
      } else {
        startDate = endDate;
      }
    }
    if (startDate > endDate) {
      const error = new Error('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.');
      error.status = 422;
      throw error;
    }

    const rows = [];
    const juzRanges = await getQuranJuzRanges(connection);
    await buildSavedMemorizationRows(students, connection, juzRanges, rows);

    const committeeName = selectedCommitteeId === 'all'
      ? 'كل الحلقات'
      : (students[0]?.committeeName || 'الحلقة المحددة');
    return {
      period: {
        from: startDate,
        to: endDate,
        committeeId: selectedCommitteeId,
        committeeName,
        studentId: selectedStudentId,
        mode: 'allTime',
      },
      rows,
    };
  } finally {
    connection.release();
  }
}

/** Build each selected student memorization row from accepted ranges and shared juz references. */
async function buildSavedMemorizationRows(students, connection, juzRanges, rows) {
  for (const student of students) {
    const memorizedRanges = await mergeQuranRanges(
      connection,
      await getStudentMemorizedRanges(connection, student.id)
    );
    const labeledMemorizationRanges = [];
    let totalFaces = 0;
    for (const range of memorizedRanges) {
      labeledMemorizationRanges.push(await enrichQuranRangeLabels(connection, range, 'ayah'));
      totalFaces += measureQuranFaces(getQuranRangeStart(range), getQuranRangeEnd(range));
    }
    if (labeledMemorizationRanges.length > 0) {
      const rangeText = labeledMemorizationRanges
        .map((range) => range.displayRange)
        .filter(Boolean)
        .join('، ');
      const memorizationRange = `${formatMemorizedSize(memorizedRanges, juzRanges, totalFaces)} — ${rangeText}`;
      rows.push({
        id: String(student.id),
        studentId: student.id,
        studentName: student.name,
        committeeName: student.committeeName || 'بدون حلقة',
        displayRange: memorizationRange,
        memorizationRange,
        totalFaces: roundQuranFaces(totalFaces),
        pageRange: labeledMemorizationRanges.map((range) => range.pageRange).filter(Boolean).join('، '),
        surahRange: labeledMemorizationRanges.map((range) => range.surahRange).filter(Boolean).join('، '),
        ranges: labeledMemorizationRanges,
      });
    }
  }
}

function getStudentSavedRowValues(row) {
  return {
    studentName: row.studentName || '-',
    committeeName: row.committeeName || 'بدون حلقة',
    memorizationRange: row.memorizationRange || row.displayRange || row.surahRange || row.pageRange || '-',
    pageRange: row.pageRange || '-',
    surahRange: row.surahRange || '-',
  };
}

async function buildStudentSavedExcel(report) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = siteConfig.name;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('محفوظ الطلاب');
  sheet.columns = studentSavedColumns.map((column) => ({ key: column.key, width: column.width }));
  sheet.addRow(studentSavedColumns.map((column) => column.label));
  report.rows.forEach((row) => {
    const values = getStudentSavedRowValues(row);
    sheet.addRow(studentSavedColumns.map((column) => values[column.key]));
  });
  styleModernReportSheet(sheet, {
    title: 'تقرير محفوظ الطلاب',
    subtitle: `${currentSiteConfig().name} | ${report.period.committeeName} | كامل المحفوظ`,
    widths: studentSavedColumns.map((column) => column.width),
    summary: [
      ['الطلاب', report.rows.length],
      ['الحلقة', report.period.committeeName],
    ],
    rightAlignedColumns: [1, 2, 3],
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function buildStudentSavedPdf(report) {
  return await new Promise((resolve, reject) => {
    const { doc, regularFont, boldFont } = createBufferedPdf({ size: 'A4', layout: 'landscape', margin: 24, bufferPages: true }, resolvePdfFontPair(), resolve, reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 28;
    const contentWidth = pageWidth - (margin * 2);
    const { primary, background, panel, softPanel, border, text, muted } = REPORT_PDF_COLORS;
    const write = createCompactPdfWriter(doc, regularFont, text);
    const drawBase = () => {
      doc.rect(0, 0, pageWidth, pageHeight).fill(background);
      doc.roundedRect(margin, 20, contentWidth, 54, 14).fill(panel).stroke(border);
      write('تقرير محفوظ الطلاب', margin + contentWidth - 292, 34, { width: 260, size: 17, color: primary, font: boldFont });
      write(`${report.period.committeeName} | كامل المحفوظ`, margin + 34, 54, { width: contentWidth - 68, size: 9.5, color: muted, font: boldFont });
    };
    const columns = [
      { label: 'كامل المحفوظ', width: 540, value: (row) => row.memorizationRange || row.displayRange || '-' },
      { label: 'الحلقة', width: 105, value: (row) => row.committeeName || 'بدون حلقة' },
      { label: 'الطالب', width: contentWidth - 645, value: (row) => row.studentName || '-' },
    ];
    let y = 90;
    const drawHeader = () => {
      let x = margin;
      doc.roundedRect(margin, y, contentWidth, 23, 8).fill('#dff4fa').stroke('#bddfeb');
      columns.forEach((column) => {
        write(column.label, x + 6, y + 7, { width: column.width - 12, align: 'center', size: 8.5, font: boldFont });
        x += column.width;
      });
      y += 29;
    };
    drawBase();
    drawHeader();
    report.rows.forEach((row, index) => {
      if (y + 25 > pageHeight - 28) {
        doc.addPage();
        drawBase();
        y = 90;
        drawHeader();
      }
      let x = margin;
      doc.roundedRect(margin, y, contentWidth, 22, 7).fill(index % 2 ? panel : softPanel).stroke('#d9edf4');
      columns.forEach((column) => {
        write(column.value(row), x + 6, y + 6, {
          width: column.width - 12,
          align: 'right',
          size: 8,
          font: column.label === 'الطالب' ? boldFont : regularFont,
        });
        x += column.width;
      });
      y += 25;
    });
    if (report.rows.length === 0) {
      doc.roundedRect(margin, y, contentWidth, 82, 14).fill(panel).stroke(border);
      write('لا يوجد حفظ أو إتقان أو مراجعة ضمن الفترة المحددة.', margin, y + 31, { width: contentWidth, align: 'center', size: 16, color: muted, font: boldFont });
    }
    doc.end();
  });
}

app.get('/api/reports/progress', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    res.json(await buildProgressReport({ ...req.query, auth: req.auth }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/student-recitation-history', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    res.json(await loadStudentRecitationHistory(db(), req.auth, req.query.studentId, buildRecitationSessionsReport));
  } catch (error) { next(error); }
});

app.get('/api/reports/recitation-sessions', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    res.json(await buildRecitationSessionsReport({ ...req.query, auth: req.auth }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/student-saved', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    res.json(await buildStudentSavedReport({ ...req.query, auth: req.auth }));
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/archives', requireManagementReportAccess, async (_req, res, next) => {
  try {
    const [rows] = await db().query(
      `
      SELECT
        id,
        title,
        DATE_FORMAT(period_from, '%Y-%m-%d') AS periodFrom,
        DATE_FORMAT(period_to, '%Y-%m-%d') AS periodTo,
        DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS createdAt
      FROM report_archives
      ORDER BY created_at DESC, id DESC
      `
    );
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

async function getReportArchiveById(archiveId, { committeeId = 'all' } = {}) {
  const [[archive]] = await db().query(
    `
    SELECT
      id,
      title,
      DATE_FORMAT(period_from, '%Y-%m-%d') AS periodFrom,
      DATE_FORMAT(period_to, '%Y-%m-%d') AS periodTo,
      progress_report_json AS progressReport,
      overview_report_json AS overviewReport,
      DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS createdAt
    FROM report_archives
    WHERE id = ?
    LIMIT 1
    `,
    [archiveId]
  );
  if (!archive) {
    const error = new Error('الأرشيف غير موجود.');
    error.status = 404;
    throw error;
  }
  const parseJson = (value, fallback) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  const progressReport = parseJson(archive.progressReport, { rows: [] });
  if (committeeId !== 'all') {
    const [[committee]] = await db().query('SELECT name FROM committees WHERE id = ? LIMIT 1', [Number(committeeId)]);
    if (committee?.name) {
      progressReport.rows = (progressReport.rows || []).filter((row) => row.committeeName === committee.name);
      progressReport.period = { ...(progressReport.period), committeeId, committeeName: committee.name };
    }
  }
  return {
    id: archive.id,
    title: archive.title,
    periodFrom: archive.periodFrom,
    periodTo: archive.periodTo,
    period: { from: archive.periodFrom, to: archive.periodTo, committeeName: progressReport.period?.committeeName },
    createdAt: archive.createdAt,
    progressReport,
    overviewReport: parseJson(archive.overviewReport, null),
  };
}

app.get('/api/reports/archives/:id', requireManagementReportAccess, async (req, res, next) => {
  try {
    const archiveId = Number(req.params.id || 0);
    res.json(await getReportArchiveById(archiveId));
  } catch (error) {
    next(error);
  }
});

app.delete('/api/reports/archives/:id', requireManagementReportAccess, async (req, res, next) => {
  try {
    const archiveId = Number(req.params.id || 0);
    const [result] = await db().query('DELETE FROM report_archives WHERE id = ?', [archiveId]);
    if (!result.affectedRows) return res.status(404).json({ message: 'الأرشيف غير موجود.' });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/supervisors/export', requireManagementReportAccess, async (req, res, next) => {
  try {
    const format = String(req.query.format || 'pdf').toLowerCase();
    const report = await buildSupervisorAttendanceReport(req.query);
    const extension = format === 'xlsx' || format === 'excel' ? 'xlsx' : 'pdf';
    const filename = `تقرير-المعلمين-${report.period.from}.${extension}`;
    if (extension === 'xlsx') {
      const buffer = await buildSupervisorExcel(report);
      setDownloadHeaders(res, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
    const buffer = await buildSupervisorPdf(report, { fontPair: resolvePdfFontPair(), siteName: currentSiteConfig().name });
    setDownloadHeaders(res, filename, 'application/pdf');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/archives/:id/export', requireManagementReportAccess, async (req, res, next) => {
  try {
    const format = String(req.query.format || 'pdf').toLowerCase();
    const archive = await getReportArchiveById(Number(req.params.id || 0), req.query);
    const extension = format === 'xlsx' || format === 'excel' ? 'xlsx' : 'pdf';
    const safeTitle = String(archive.title || 'أرشيف-التقارير').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60);
    const filename = `${safeTitle}-${archive.periodFrom}-إلى-${archive.periodTo}.${extension}`;
    if (extension === 'xlsx') {
      const buffer = await buildArchiveExcel(archive);
      setDownloadHeaders(res, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
    const buffer = await buildArchivePdf(archive, { fontPair: resolvePdfFontPair(), siteName: currentSiteConfig().name });
    setDownloadHeaders(res, filename, 'application/pdf');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/progress/export', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    const format = String(req.query.format || 'pdf').toLowerCase();
    const report = await buildProgressReport({ ...req.query, auth: req.auth });
    if (format === 'xlsx' || format === 'excel') {
      const buffer = await buildProgressExcel(report);
      setDownloadHeaders(res, reportFileName(report, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
    const buffer = await buildProgressPdf(report);
    setDownloadHeaders(res, reportFileName(report, 'pdf'), 'application/pdf');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/recitation-sessions/export', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    const format = String(req.query.format || 'pdf').toLowerCase();
    const report = await buildRecitationSessionsReport({ ...req.query, auth: req.auth });
    if (format === 'xlsx' || format === 'excel') {
      const buffer = await buildRecitationSessionsExcel(report);
      setDownloadHeaders(res, recitationReportFileName(report, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
    const buffer = await buildRecitationSessionsPdf(report);
    setDownloadHeaders(res, recitationReportFileName(report, 'pdf'), 'application/pdf');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/student-saved/export', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    const format = String(req.query.format || 'pdf').toLowerCase();
    const report = await buildStudentSavedReport({ ...req.query, auth: req.auth });
    if (format === 'xlsx' || format === 'excel') {
      const buffer = await buildStudentSavedExcel(report);
      setDownloadHeaders(res, studentSavedReportFileName(report, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(buffer);
    }
    const buffer = await buildStudentSavedPdf(report);
    setDownloadHeaders(res, studentSavedReportFileName(report, 'pdf'), 'application/pdf');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/whatsapp-recipients', requireManagementReportAccess, async (_req, res, next) => {
  try {
    const [rows] = await db().query(
      `
      SELECT id, name, phone
      FROM supervisors
      WHERE role = 'supervisor'
      ORDER BY name ASC
      `
    );
    res.json(rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
    })));
  } catch (error) {
    next(error);
  }
});

app.post('/api/reports/send-whatsapp', requireManagementReportAccess, async (req, res, next) => {
  try {
    const supervisorIds = Array.isArray(req.body.supervisorIds) ? req.body.supervisorIds.map(Number).filter(Boolean) : [];
    if (supervisorIds.length === 0) {
      return res.status(422).json({ message: 'اختر معلماً واحداً على الأقل.' });
    }
    const reportType = ['progress', 'recitationSessions', 'studentSaved', 'overview', 'supervisors', 'archive'].includes(req.body.reportType)
      ? req.body.reportType
      : 'progress';
    const formats = [...new Set((Array.isArray(req.body.formats) ? req.body.formats : ['pdf'])
      .filter((format) => ['pdf', 'xlsx'].includes(format)))];
    if (formats.length === 0) {
      return res.status(422).json({ message: 'اختر PDF أو Excel على الأقل.' });
    }
    let report;
    let reportTitle;
    let buildPdf;
    let buildExcel;
    let getFileName;
    ({ report, reportTitle, buildPdf, buildExcel, getFileName } = await prepareWhatsAppReport({ reportType, report, req, reportTitle, buildPdf, buildExcel, getFileName }));
    const attachments = [];
    if (formats.includes('pdf')) {
      const buffer = await buildPdf(report);
      attachments.push({ name: getFileName(report, 'pdf'), type: 'application/pdf', data: buffer.toString('base64') });
    }
    if (formats.includes('xlsx')) {
      const buffer = await buildExcel(report);
      attachments.push({
        name: getFileName(report, 'xlsx'),
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        data: buffer.toString('base64'),
      });
    }

    await refreshWhatsAppState({ waitMs: 10000 });
    if (!whatsAppState.ready) {
      return res.status(409).json({ message: WHATSAPP_LINK_REQUIRED_MESSAGE });
    }

    const [supervisors] = await db().query(
      `
      SELECT id, name, phone
      FROM supervisors
      WHERE role = 'supervisor' AND id IN (${supervisorIds.map(() => '?').join(',')})
      ORDER BY name ASC
      `,
      supervisorIds
    );

    const failed = [];
    const prepared = [];
    const period = report.period || {};
    const committeeLabel = period.committeeName ? ` - ${period.committeeName}` : '';
    const message = reportType === 'studentSaved'
      ? `${reportTitle}${committeeLabel}\nكامل المحفوظ`
      : `${reportTitle}${committeeLabel}\nالفترة: ${period.from || req.body.from || '-'} إلى ${period.to || req.body.to || '-'}`;
    await sendPreparedReportRecipients({ supervisors, failed, attachments, message, reportTitle, prepared });

    return sendWhatsAppResult(res, prepared, failed, 'لم يتم إرسال أي تقرير.');
  } catch (error) {
    next(error);
  }
});

/** Build the requested report with the same authorization context and export format handlers. */
async function prepareWhatsAppReport({ reportType, report, req, reportTitle, buildPdf, buildExcel, getFileName }) {
  if (reportType === 'overview') {
    report = await buildOverviewReport(req.body);
    reportTitle = 'تقرير الإحصائيات';
    buildPdf = (data) => buildOverviewPdf(data, { fontPair: resolvePdfFontPair() });
    buildExcel = buildOverviewExcel;
    getFileName = (data, extension) => `الإحصائيات-${data.period.from}-إلى-${data.period.to}.${extension}`;
  } else if (reportType === 'supervisors') {
    report = await buildSupervisorAttendanceReport(req.body);
    reportTitle = 'تقرير الكادر';
    buildPdf = (data) => buildSupervisorPdf(data, { fontPair: resolvePdfFontPair(), siteName: currentSiteConfig().name });
    buildExcel = buildSupervisorExcel;
    getFileName = (data, extension) => `تقرير-المعلمين-${data.period.from}.${extension}`;
  } else if (reportType === 'archive') {
    report = await getReportArchiveById(Number(req.body.archiveId || 0), req.body);
    reportTitle = report.title || 'أرشيف التقارير';
    buildPdf = (data) => buildArchivePdf(data, { fontPair: resolvePdfFontPair(), siteName: currentSiteConfig().name });
    buildExcel = buildArchiveExcel;
    getFileName = (data, extension) => `${String(data.title || 'أرشيف-التقارير').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').slice(0, 60)}-${data.period.from}-إلى-${data.period.to}.${extension}`;
  } else if (reportType === 'recitationSessions') {
    report = await buildRecitationSessionsReport({ ...req.body, auth: req.auth });
    reportTitle = 'تقرير جلسات التسميع';
    buildPdf = buildRecitationSessionsPdf;
    buildExcel = buildRecitationSessionsExcel;
    getFileName = recitationReportFileName;
  } else if (reportType === 'studentSaved') {
    report = await buildStudentSavedReport({ ...req.body, auth: req.auth });
    reportTitle = 'تقرير محفوظ الطلاب';
    buildPdf = buildStudentSavedPdf;
    buildExcel = buildStudentSavedExcel;
    getFileName = studentSavedReportFileName;
  } else {
    report = await buildProgressReport({ ...req.body, auth: req.auth });
    reportTitle = 'متابعة الطلاب';
    buildPdf = buildProgressPdf;
    buildExcel = buildProgressExcel;
    getFileName = reportFileName;
  }
  return { report, reportTitle, buildPdf, buildExcel, getFileName };
}

/** Send report attachments in order and retain per-recipient delivery failures. */
async function sendPreparedReportRecipients({ supervisors, failed, attachments, message, reportTitle, prepared }) {
  for (const [index, supervisor] of supervisors.entries()) {
    const phone = normalizeWhatsAppPhone(supervisor.phone);
    if (!phone) {
      failed.push({ id: supervisor.id, name: supervisor.name, reason: 'رقم الجوال غير صالح.' });
      continue;
    }
    let status = 'sent';
    try {
      for (const [attachmentIndex, attachment] of attachments.entries()) {
        const attachmentMessage = attachmentIndex === 0 ? message : `${reportTitle} - Excel`;
        await sendWhatsAppOnce(db(), { phone, message: attachmentMessage, attachment, send: sendWhatsAppMessage });
      }
    } catch (error) {
      status = 'failed';
      const failureReason = error.message || 'تعذر الإرسال من واتساب المرتبط.';
      failed.push({ id: supervisor.id, name: supervisor.name, reason: failureReason });
    }
    prepared.push({ id: supervisor.id, name: supervisor.name, phone, status });
    if (index < supervisors.length - 1) await wait(randomWhatsAppDelay());
  }
}

async function getTeacherPointsTermStart(settings, queryExecutor = db()) {
  if (isValidDateOnly(settings.currentTermStartDate)) return settings.currentTermStartDate;
  return getFirstReportDate(queryExecutor);
}

app.get('/api/teacher-points/students', async (req, res, next) => {
  try {
    if (req.auth?.role !== 'supervisor') {
      return res.status(403).json({ message: 'الإضافة والخصم متاحان للمعلم فقط.' });
    }
    const settings = await loadSettings();
    if (!settings.teacherManualPointsEnabled) {
      return res.status(403).json({ message: 'الإضافة والخصم غير مفعّلين.' });
    }
    const termStartDate = await getTeacherPointsTermStart(settings);
    const [students] = await db().query(
      `
      SELECT DISTINCT s.id, s.name, s.points, c.name AS committeeName
      FROM students s
      JOIN committees c ON c.id = s.committee_id
      JOIN supervisor_committees sc
        ON sc.committee_id = s.committee_id
       AND sc.supervisor_id = ?
      ORDER BY s.name ASC
      `,
      [req.auth.id],
    );
    const [[usage]] = await db().query(
      `
      SELECT COALESCE(SUM(points), 0) AS used
      FROM student_point_transactions
      WHERE supervisor_id = ?
        AND source_type IN ('supervisor_award', 'supervisor_deduction')
        AND transaction_date >= ?
      `,
      [req.auth.id, termStartDate],
    );
    const limit = Math.max(0, Number(settings.teacherManualPointsTermLimit || 0));
    const used = Number(usage.used || 0);
    return res.json({
      students: students.map((student) => ({ ...student, points: Number(student.points || 0) })),
      types: settings.teacherPointTypes,
      term: { startDate: termStartDate, limit, used, remaining: Math.max(0, limit - used) },
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/teacher-points/adjustments', async (req, res, next) => {
  const connection = await db().getConnection();
  let transactionStarted = false;
  try {
    if (req.auth?.role !== 'supervisor') {
      return res.status(403).json({ message: 'الإضافة والخصم متاحان للمعلم فقط.' });
    }
    const studentId = Number(req.body.studentId || 0);
    const adjustmentTypeId = String(req.body.adjustmentTypeId || '').trim();
    const note = String(req.body.reason || '').trim();
    const rejectInvalidTeacherPointInputResult = await rejectInvalidTeacherPointInput({ studentId, adjustmentTypeId, note, res });
    if (rejectInvalidTeacherPointInputResult) { return rejectInvalidTeacherPointInputResult; }
    await connection.beginTransaction();
    transactionStarted = true;
    await connection.query('SELECT id FROM supervisors WHERE id = ? FOR UPDATE', [req.auth.id]);
    const settings = await loadSettings(connection);
    if (!settings.teacherManualPointsEnabled) {
      const error = new Error('الإضافة والخصم غير مفعّلين.');
      error.statusCode = 403;
      throw error;
    }
    const adjustmentType = settings.teacherPointTypes.find((item) => item.id === adjustmentTypeId);
    if (!adjustmentType) {
      const error = new Error('نوع العملية غير متاح. حدّث الصفحة ثم اختر نوعًا آخر.');
      error.statusCode = 422;
      throw error;
    }
    const type = adjustmentType.operation;
    const points = adjustmentType.points;
    const reason = note ? `${adjustmentType.label} — ${note}` : adjustmentType.label;
    const [[student]] = await connection.query(
      `
      SELECT s.id, s.points
      FROM students s
      JOIN supervisor_committees sc
        ON sc.committee_id = s.committee_id
       AND sc.supervisor_id = ?
      WHERE s.id = ?
      LIMIT 1
      FOR UPDATE
      `,
      [req.auth.id, studentId],
    );
    if (!student) {
      const error = new Error('يمكنك تعديل نقاط طلاب حلقتك فقط.');
      error.statusCode = 403;
      throw error;
    }
    if (type === 'deduction' && Number(student.points || 0) < points) {
      const error = new Error('رصيد الطالب لا يكفي لتنفيذ هذا الخصم.');
      error.statusCode = 422;
      throw error;
    }
    const effectiveRequestedPoints = points;
    const termStartDate = await getTeacherPointsTermStart(settings, connection);
    const [[usage]] = await connection.query(
      `
      SELECT COALESCE(SUM(points), 0) AS used
      FROM student_point_transactions
      WHERE supervisor_id = ?
        AND source_type IN ('supervisor_award', 'supervisor_deduction')
        AND transaction_date >= ?
      `,
      [req.auth.id, termStartDate],
    );
    const limit = Math.max(0, Number(settings.teacherManualPointsTermLimit || 0));
    const used = Number(usage.used || 0);
    const remaining = Math.max(0, limit - used);
    if (!limit || effectiveRequestedPoints > remaining) {
      const error = new Error(`تجاوزت حد المعلم في الفصل. المتبقي ${remaining} نقطة.`);
      error.statusCode = 422;
      throw error;
    }

    const today = getSaudiDateTimeParts().date;
    const effectiveDelta = await applyStudentPointDelta(
      connection,
      studentId,
      type === 'increase' ? effectiveRequestedPoints : -effectiveRequestedPoints,
      settings,
      { date: today },
    );
    const transactionId = await logStudentPointTransaction(connection, {
      studentId,
      supervisorId: req.auth.id,
      actorRole: 'supervisor',
      actorName: req.auth.name || 'المعلم',
      type,
      points: Math.abs(effectiveDelta),
      reason,
      date: today,
      sourceType: type === 'increase' ? 'supervisor_award' : 'supervisor_deduction',
    });
    await notifyTeacherPointAdjustment(connection, {
      transactionId, studentId, type, points: Math.abs(effectiveDelta), reason, actor: req.auth,
    });
    await connection.commit();
    transactionStarted = false;
    return res.json({
      ok: true,
      points: Math.abs(effectiveDelta),
      type,
      adjustmentType: {
        id: adjustmentType.id,
        label: adjustmentType.label,
      },
      remaining: Math.max(0, remaining - Math.abs(effectiveDelta)),
    });
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    return next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/reports/grading-sessions', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    const today = getSaudiDateTimeParts().date;
    res.json(await buildGradingSessionReport(db(), {
      component: String(req.query.component || ''), from: String(req.query.from || today), to: String(req.query.to || today),
      committeeId: req.query.committeeId || 'all', auth: req.auth,
    }));
  } catch (error) { next(error); }
});

app.get('/api/reports/teacher-points', requireReportsOrOwnCommittee, async (req, res, next) => {
  try {
    const settings = await loadSettings();
    if (!settings.teacherManualPointsEnabled) {
      return res.status(403).json({ message: 'الإضافة والخصم غير مفعّلين.' });
    }
    const termStartDate = await getTeacherPointsTermStart(settings);
    const from = isValidDateOnly(req.query.from) ? req.query.from : termStartDate;
    const to = isValidDateOnly(req.query.to) ? req.query.to : getSaudiDateTimeParts().date;
    if (from > to) return res.status(422).json({ message: 'نطاق التاريخ غير صحيح.' });
    const params = [from, to];
    const teacherFilter = req.auth?.role === 'supervisor' ? 'AND t.supervisor_id = ?' : '';
    if (teacherFilter) params.push(req.auth.id);
    const [rows] = await db().query(
      `
      SELECT
        t.id,
        t.student_id AS studentId,
        st.name AS studentName,
        c.name AS committeeName,
        t.transaction_type AS type,
        t.points,
        t.reason,
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transactionDate,
        COALESCE(t.actor_name, sp.name, 'المعلم') AS teacherName
      FROM student_point_transactions t
      JOIN students st ON st.id = t.student_id
      LEFT JOIN committees c ON c.id = st.committee_id
      LEFT JOIN supervisors sp ON sp.id = t.supervisor_id
      WHERE t.source_type IN ('supervisor_award', 'supervisor_deduction')
        AND t.transaction_date BETWEEN ? AND ?
        ${teacherFilter}
      ORDER BY t.created_at DESC, t.id DESC
      `,
      params,
    );
    return res.json({
      period: { from, to },
      rows: rows.map((row) => ({ ...row, points: Number(row.points || 0) })),
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/students/:id/points/award', requirePermission('students'), async (req, res, next) => {
  const connection = await db().getConnection();
  try {
    const points = Math.max(0, Number(req.body.points || 0));
    const reason = String(req.body.reason || 'منح نقاط للطالب').trim();
    if (!points) return res.status(422).json({ message: 'أدخل عدد النقاط.' });
    if (!reason) return res.status(422).json({ message: 'سبب منح النقاط مطلوب.' });

    const today = getSaudiDateTimeParts().date;
    const settings = await loadSettings();
    const [[student]] = await connection.query('SELECT id FROM students WHERE id = ?', [req.params.id]);
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود.' });

    await connection.beginTransaction();
    const effectiveDelta = await applyStudentPointDelta(connection, req.params.id, points, settings, { date: today });
    await logStudentPointTransaction(connection, {
      studentId: req.params.id,
      actorRole: req.auth?.role || 'manager',
      actorName: req.auth?.name || 'المدير',
      type: 'increase',
      points: effectiveDelta,
      reason,
      date: today,
      sourceType: 'manual_award',
    });
    await connection.commit();

    res.json({ ok: true, points: effectiveDelta });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get('/api/reports/student-points', async (req, res, next) => {
  try {
    const committeeId = Number(req.query.committeeId || 0);
    const params = [];
    const where = committeeId ? 'WHERE s.committee_id = ?' : '';
    if (committeeId) params.push(committeeId);
    const [rows] = await db().query(
      `
      SELECT
        s.id,
        s.name,
        s.points,
        s.committee_id AS committeeId,
        c.name AS committeeName
      FROM students s
      LEFT JOIN committees c ON c.id = s.committee_id
      ${where}
      ORDER BY s.points DESC, s.name ASC
      `,
      params,
    );
    return res.json(rows.map((row) => ({
      ...row,
      points: Number(row.points || 0),
    })));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/reports/points', async (req, res, next) => {
  try {
    const reportType = req.query.type === 'families' ? 'families' : 'students';
    if (reportType === 'families') {
      const familyId = Number(req.query.familyId || 0);
      const filters = [];
      const params = [];
      if (familyId) {
        filters.push('c.id = ?');
        params.push(familyId);
      }
      const [rows] = await db().query(
        `
        SELECT
          c.id,
          c.name AS familyName,
          c.points,
          COALESCE(c.student_points_contribution, 0) AS studentPointsContribution,
          COUNT(s.id) AS studentsCount
        FROM committees c
        LEFT JOIN students s ON s.committee_id = c.id
        ${filters.length ? 'WHERE ' + filters.join(' AND ') : ''}
        GROUP BY c.id, c.name, c.points, c.student_points_contribution
        ORDER BY c.points DESC, c.name ASC
        `,
        params
      );
      const familyIds = rows.map((row) => Number(row.id)).filter(Boolean);
      const detailsByFamily = new Map(familyIds.map((id) => [String(id), []]));
      const addFamilyDetail = (familyIdValue, detail) => {
        const key = String(familyIdValue);
        if (!detailsByFamily.has(key)) detailsByFamily.set(key, []);
        detailsByFamily.get(key).push(detail);
      };

      await loadFamilyPointDetails(familyIds, addFamilyDetail);

      return res.json(rows.map((row) => {
        const points = Number(row.points || 0);
        const studentContribution = Number(row.studentPointsContribution || 0);
        const details = points > 0 ? [...(detailsByFamily.get(String(row.id)) || [])] : [];
        if (points > 0 && studentContribution > 0) {
          details.push({
            source: 'student_points',
            sourceLabel: 'نقاط الطلاب',
            reason: 'مساهمة نقاط الطلاب المرتبطين بالحلقة',
            actorName: 'النظام',
            points: studentContribution,
            count: 0,
            latestDate: '',
          });
        }

        const explainedPoints = details.reduce((sum, detail) => sum + Number(detail.points || 0), 0);
        const unexplainedPoints = Math.max(0, points - explainedPoints);
        if (unexplainedPoints > 0) {
          details.push({
            source: 'legacy_balance',
            sourceLabel: 'رصيد سابق',
            reason: 'رصيد سابق أو تعديل مباشر غير مفصل',
            actorName: 'النظام',
            points: unexplainedPoints,
            count: 0,
            latestDate: '',
          });
        }

        const reasonSummary = details.length
          ? details.slice(0, 3).map((detail) => `${detail.reason} (${detail.points})`).join('، ')
          : 'لا توجد أسباب مسجلة لهذا الرصيد';

        return {
          ...row,
          scope: 'family',
          points,
          studentPointsContribution: studentContribution,
          studentsCount: Number(row.studentsCount || 0),
          reasonSummary,
          reasonDetails: details,
        };
      }));
    }

    const studentId = Number(req.query.studentId || 0);
    const reportDate = req.query.date || getSaudiDateTimeParts().date;
    const filters = [];
    const params = [];
    if (studentId) {
      filters.push('t.student_id = ?');
      params.push(studentId);
    } else {
      filters.push('t.transaction_date = ?');
      params.push(reportDate);
    }
    const [rows] = await db().query(
      `
      SELECT
        t.id,
        t.student_id AS studentId,
        t.transaction_type AS type,
        t.points,
        t.reason,
        t.source_type AS sourceType,
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transactionDate,
        DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i') AS createdAt,
        st.name AS studentName,
        COALESCE(
          t.actor_name,
          sp.name,
          CASE
            WHEN t.source_type IN ('manager_adjustment', 'manual_award', 'family_adjustment') THEN 'المدير'
            WHEN t.source_type = 'grade' THEN 'النظام'
            ELSE NULL
          END
        ) AS supervisorName,
        COALESCE(t.actor_role, CASE WHEN sp.id IS NOT NULL THEN 'supervisor' ELSE 'system' END) AS actorRole
      FROM student_point_transactions t
      JOIN students st ON st.id = t.student_id
      LEFT JOIN supervisors sp ON sp.id = t.supervisor_id
      WHERE ${filters.join(' AND ')}
      ORDER BY t.created_at DESC
      `,
      params
    );
    res.json(rows.map((row) => ({
      ...row,
      points: Number(row.points || 0),
      reason: normalizePointReason(row.reason, row.sourceType),
      sourceLabel: getStudentPointSourceLabel(row.sourceType),
    })));
  } catch (error) {
    next(error);
  }
});

app.get('/api/students/:id/points', async (req, res, next) => {
  try {
    const [[student]] = await db().query('SELECT id, name, points FROM students WHERE id = ?', [req.params.id]);
    if (!student) return res.status(404).json({ message: 'الطالب غير موجود.' });

    const [transactions] = await db().query(
      `
      SELECT
        t.id,
        t.transaction_type AS type,
        t.points,
        t.reason,
        t.source_type AS sourceType,
        DATE_FORMAT(t.transaction_date, '%Y-%m-%d') AS transactionDate,
        DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i') AS createdAt,
        COALESCE(
          t.actor_name,
          sp.name,
          CASE
            WHEN t.source_type IN ('manager_adjustment', 'manual_award', 'family_adjustment') THEN 'المدير'
            WHEN t.source_type = 'grade' THEN 'النظام'
            ELSE NULL
          END
        ) AS supervisorName,
        COALESCE(t.actor_role, CASE WHEN sp.id IS NOT NULL THEN 'supervisor' ELSE 'system' END) AS actorRole
      FROM student_point_transactions t
      LEFT JOIN supervisors sp ON sp.id = t.supervisor_id
      WHERE t.student_id = ?
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 100
      `,
      [req.params.id]
    );

    res.json({
      student: { ...student, points: Number(student.points || 0) },
      transactions: transactions.map((row) => ({
        ...row,
        points: Number(row.points || 0),
        reason: normalizePointReason(row.reason, row.sourceType),
        sourceLabel: getStudentPointSourceLabel(row.sourceType),
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.use((error, req, res, _next) => {
  console.error(JSON.stringify({ event: 'request_error', requestId: req.traceId, code: error.code || 'SERVER_ERROR' }));
  const status = Number(error.statusCode || error.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return res.status(status).json({ message: publicErrorMessage(error), requestId: req.traceId });
  }
  if (error.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'رقم الدخول مستخدم مسبقاً.' });
  }
  res.status(500).json({ message: publicErrorMessage(error), requestId: req.traceId });
});

try {
    await initDatabase();
    const registrationNumber = String(siteConfig.registrationNumber || '').trim();
    const currentComplex = /^\d{2,12}$/.test(registrationNumber)
      ? {
        registrationNumber,
        name: siteConfig.name,
        databaseName: process.env.MYSQL_DATABASE || `wajeh_${siteConfig.key}`,
        appUrl: process.env.PUBLIC_APP_URL || siteConfig.appUrl,
        apiUrl: process.env.PUBLIC_API_URL || siteConfig.apiUrl,
        whatsappUrl: siteConfig.whatsappUrl,
      }
      : null;
    await initPlatformDatabase(currentComplex);
    await ensureManagerSupervisorAccount();
    await reconcileAllTenantStartupState();
    startAutomaticAbsenceScheduler();
    app.listen(port, process.env.API_HOST || undefined);
    try { await refreshWhatsAppState({ waitMs: 15000 }); }
    catch (error) { console.error('WhatsApp warmup failed:', error.message); }
} catch (error) {
    console.error('MySQL initialization failed:', error);
    process.exit(1);
}



import { nativeUpdatePolicy } from './services/nativeUpdate.js';
import { buildOverviewRankings } from './services/overviewRankings.js';
import { loadTeacherReading, saveTeacherReading } from './services/selfReading.js';
import { isMistakeMark } from '../shared/recitation-mark-types.js';

/** Load point histories for all selected families using batched parameterized queries. */
async function loadFamilyPointDetails(familyIds, addFamilyDetail) {
  if (familyIds.length > 0) {
    const placeholders = familyIds.map(() => '?').join(', ');
    const [awardRows] = await db().query(
      `
          SELECT
            a.committee_id AS familyId,
            COALESCE(i.name, 'بند تقييم حلقة') AS itemName,
            COALESCE(sp.name, 'المعلم') AS supervisorName,
            COALESCE(SUM(a.points), 0) AS points,
            COUNT(*) AS count,
            DATE_FORMAT(MAX(a.award_date), '%Y-%m-%d') AS latestDate
          FROM supervisor_family_point_awards a
          LEFT JOIN supervisor_family_items i ON i.id = a.item_id
          LEFT JOIN supervisors sp ON sp.id = a.supervisor_id
          WHERE a.committee_id IN (${placeholders})
          GROUP BY a.committee_id, i.name, sp.name
          HAVING points > 0
          `,
      familyIds
    );
    for (const detail of awardRows) {
      addFamilyDetail(detail.familyId, {
        source: 'family_evaluation',
        sourceLabel: 'تقييم الحلقة',
        reason: `تقييم الحلقة: ${detail.itemName}`,
        actorName: detail.supervisorName,
        points: Number(detail.points || 0),
        count: Number(detail.count || 0),
        latestDate: detail.latestDate || '',
      });
    }

    const [achievementRows] = await db().query(
      `
          SELECT
            family_id AS familyId,
            title,
            COALESCE(supervisor_name, 'المدير') AS actorName,
            COALESCE(SUM(points), 0) AS points,
            COUNT(*) AS count,
            DATE_FORMAT(MAX(achieved_at), '%Y-%m-%d') AS latestDate
          FROM family_achievements
          WHERE family_id IN (${placeholders})
          GROUP BY family_id, title, supervisor_name
          HAVING points > 0
          `,
      familyIds
    );
    for (const detail of achievementRows) {
      addFamilyDetail(detail.familyId, {
        source: 'family_achievement',
        sourceLabel: 'وسام الحلقة',
        reason: `وسام الحلقة: ${detail.title}`,
        actorName: detail.actorName,
        points: Number(detail.points || 0),
        count: Number(detail.count || 0),
        latestDate: detail.latestDate || '',
      });
    }
  }
}

/** Normalize attendance modes and location values without changing legacy defaults. */
function normalizeAttendanceSettings(settings, attendanceDays) {
  return {
    attendanceDays: settings.attendanceDays === undefined ? [0, 3] : attendanceDays,
    attendanceManualEnabled: settings.attendanceManualEnabled !== 'false',
    attendanceAccountEnabled: settings.attendanceAccountEnabled === 'true',
    allowEarlyAttendance: settings.allowEarlyAttendance !== 'false',
    attendanceStartTime: settings.attendanceStartTime || '16:00',
    attendanceLocationUrl: settings.attendanceLocationUrl || '',
    attendanceLocationLat: settings.attendanceLocationLat ? Number(settings.attendanceLocationLat) : null,
    attendanceLocationLng: settings.attendanceLocationLng ? Number(settings.attendanceLocationLng) : null,
    staffAttendanceSource: settings.staffAttendanceSource === 'teacher' ? 'teacher' : 'supervisor',
    staffAttendanceLocationUrl: settings.staffAttendanceLocationUrl || '',
    staffAttendanceLocationLat: settings.staffAttendanceLocationUrl && settings.staffAttendanceLocationLat
      ? Number(settings.staffAttendanceLocationLat)
      : null,
    staffAttendanceLocationLng: settings.staffAttendanceLocationUrl && settings.staffAttendanceLocationLng
      ? Number(settings.staffAttendanceLocationLng)
      : null,
    staffAttendanceLateAfterAsrMinutes: Math.max(0, Number(settings.staffAttendanceLateAfterAsrMinutes ?? 50))
  };
}

/** Reject stale carried ranges that would skip the next unfinished Quran position. */
async function isNextCarriedMemorization({ isMemorization, lastCarriedMemorizationEnd, connection, plan, nextUnmemorized, task }) {
    if (!isMemorization) {
      return true;
    }
      // Carry only the next missing range; stale future tasks must not jump over it.
      const expectedStart = lastCarriedMemorizationEnd
        ? await getAdjacentQuranAyahInDirection(connection, lastCarriedMemorizationEnd, getQuranRangeDirection(
          { page: plan.startPage, surah: plan.startSurah, ayah: plan.startAyah },
          { page: plan.endPage, surah: plan.endSurah, ayah: plan.endAyah }
        ))
        : nextUnmemorized;
      return Boolean(expectedStart && isSameQuranPosition(taskStartPosition(task), expectedStart));
}

/** Use the configured local listening count for the task track. */
function getTeacherExpectedListeningCount(task, settings) {
  return normalizeRepeatCount(task.track === "mastery" ? settings.masteryListeningCount : settings.memorizationListeningCount, 3);
}

/** Reject unavailable or stale recitation tasks before claiming a session. */
async function rejectInvalidRecitationTask({ task, settings, connection, res, notMemorized }) {
if (!task || !canTeacherExecuteQuranTask(settings, task.taskType)) {
      await connection.rollback();
      return res.status(404).json({ message: 'المهمة غير موجودة ضمن جلسة التسميع الحالية.' });
    }
    if (task.taskType === 'link' && !await isLinkTaskWithinAcceptedMemorization(connection, task)) {
      await connection.rollback();
      return res.status(409).json({
        message: 'تغيّر مقدار محفوظ الطالب، أعد فتح الجلسة ليظهر الربط الصحيح.',
        code: 'STALE_LINK_TASK',
      });
    }
    if (notMemorized && !canMarkRecitationFailed(task)) {
      await connection.rollback();
      return res.status(422).json({ message: 'خيار الرسوب غير متاح لهذا المقدار.' });
    }

  return null;
}

/** Reject a changed evaluation mode or a payload incompatible with the active policy. */
async function rejectInvalidRecitationMode({ requestedEvaluationMode, evaluationMode, connection, res, ayahMarksPayload, wordMarksPayload, notMemorized }) {
if (requestedEvaluationMode && requestedEvaluationMode !== evaluationMode) {
      await connection.rollback();
      return res.status(409).json({ message: 'تغيّر نظام التسميع. أعد فتح الجلسة ثم حاول مجددًا.' });
    }
    if (evaluationMode === 'count' && (ayahMarksPayload || wordMarksPayload)) {
      await connection.rollback();
      return res.status(422).json({ message: 'هذا التسميع مضبوط على العدّ فقط.' });
    }
    if (!notMemorized && evaluationMode === 'mushaf' && requestedEvaluationMode === 'mushaf' && !ayahMarksPayload && !wordMarksPayload) {
      await connection.rollback();
      return res.status(422).json({ message: 'هذا التسميع مضبوط على المصحف التفصيلي.' });
    }

  return null;
}

/** Require an enabled attendance method and at least one configured attendance day. */
async function rejectInvalidAttendanceSettings({ settings, res }) {
if (!settings.attendanceManualEnabled
      && !settings.attendanceAccountEnabled
      && settings.recitationAttendanceSource !== 'teacher') {
      return res.status(422).json({ message: 'يجب تفعيل طريقة تحضير واحدة على الأقل.' });
    }

    if ((settings.attendanceManualEnabled || settings.attendanceAccountEnabled) && settings.attendanceDays.length === 0) {
      return res.status(422).json({ message: 'اختر يوماً واحداً على الأقل للتحضير.' });
    }


  return null;
}

/** Require the message templates used by enabled automatic notifications and registration. */
async function rejectMissingMessageTemplates({ settings, res }) {
if (settings.automaticAbsenceMessageEnabled && !settings.attendanceAbsentTemplate) {
      return res.status(422).json({ message: 'قالب الغياب مطلوب عند تفعيل رسالة الغياب التلقائية.' });
    }

    if (settings.automaticExecutionMessageEnabled && !settings.executionReminderTemplate) {
      return res.status(422).json({ message: 'قالب رسالة التنفيذ مطلوب عند تفعيل الإرسال التلقائي للتنفيذ.' });
    }

    if (settings.registrationEnabled && (!settings.registrationPreAcceptTemplate || !settings.registrationAcceptTemplate || !settings.registrationRejectTemplate)) {
      return res.status(422).json({ message: 'قوالب رسائل التسجيل مطلوبة عند فتح التسجيل.' });
    }


  return null;
}

/** Require at least one recitation session day before saving. */
async function rejectEmptyActivitySchedules({ settings, res }) {
    if (settings.recitationSessionDays.length === 0) {
      return res.status(422).json({ message: 'اختر جلسة تسميع واحدة على الأقل.' });
    }


  return null;
}

/** Validate finite nonnegative values and all score bounds before starting the write transaction. */
async function rejectInvalidEvaluationSettings({ settings, res }) {
    if (
      !Number.isFinite(settings.maxSupervisorStudentPoints) ||
      !Number.isFinite(settings.maxDailyStudentPoints) ||
      !Number.isFinite(settings.maxSupervisorFamilyItemsPoints) ||
      !Number.isFinite(settings.maxSupervisorDeductionPoints) ||
      !Number.isFinite(settings.teacherManualPointsTermLimit) ||
      !Number.isFinite(settings.staffAttendanceLateAfterAsrMinutes) ||
      !Number.isFinite(settings.narrationMaxScore) ||
      !Number.isFinite(settings.narrationWarningDeduction) ||
      !Number.isFinite(settings.narrationMistakeDeduction) ||
      settings.maxSupervisorStudentPoints < 0 ||
      settings.maxDailyStudentPoints < 0 ||
      settings.maxSupervisorFamilyItemsPoints < 0 ||
      settings.maxSupervisorDeductionPoints < 0 ||
      settings.teacherManualPointsTermLimit < 0 ||
      settings.staffAttendanceLateAfterAsrMinutes < 0 ||
      settings.staffAttendanceLateAfterAsrMinutes > 1440 ||
      settings.narrationMaxScore < 1 ||
      settings.narrationWarningDeduction < 0 ||
      settings.narrationMistakeDeduction < 0 ||
      settings.narrationWarningDeduction > settings.narrationMaxScore ||
      settings.narrationMistakeDeduction > settings.narrationMaxScore
    ) {
      return res.status(422).json({ message: 'قيم النقاط يجب أن تكون صفرًا أو أكثر.' });
    }


  return null;
}

/** Resolve configured attendance coordinates and reject invalid times before saving settings. */
async function resolveAttendanceLocationSettings({ settings, res }) {
if (settings.attendanceLocationUrl) {
      const coordinates = await resolveGoogleMapsCoordinates(settings.attendanceLocationUrl);
      if (!coordinates) {
        return res.status(422).json({ message: 'تعذر استخراج الموقع من رابط قوقل ماب.' });
      }
      settings.attendanceLocationLat = coordinates.lat;
      settings.attendanceLocationLng = coordinates.lng;
    }

    if (!isValidTimeString(settings.attendanceStartTime)) {
      return res.status(422).json({ message: 'وقت الحضور غير صحيح.' });
    }

    if (!hasStudentQuranExecution(settings)) {
      settings.automaticExecutionMessageEnabled = false;
    }

    if (settings.staffAttendanceSource === 'teacher' && settings.staffAttendanceLocationUrl) {
      const coordinates = await resolveGoogleMapsCoordinates(settings.staffAttendanceLocationUrl);
      if (!coordinates) {
        return res.status(422).json({ message: 'تعذر استخراج موقع تحضير المعلمين والإدارة من رابط قوقل ماب.' });
      }
      settings.staffAttendanceLocationLat = coordinates.lat;
      settings.staffAttendanceLocationLng = coordinates.lng;
    } else if (!settings.staffAttendanceLocationUrl) {
      settings.staffAttendanceLocationLat = null;
      settings.staffAttendanceLocationLng = null;
    }


  return null;
}

/** Require one owned task group and reject stale or teacher-controlled execution before any update. */
async function rejectInvalidExecutionGroup({ taskRows, first, connection, settings, res }) {
const sameGroup = taskRows.every((task) =>
      Number(task.planId) === Number(first.planId)
        && task.taskDate === first.taskDate
        && task.taskType === first.taskType
        && task.track === first.track
    );
    if (!sameGroup) {
      await connection.rollback();
      return res.status(422).json({ message: 'يجب تنفيذ مقدار واحد في كل مرة.' });
    }
    if (first.taskType === 'link') {
      for (const task of taskRows) {
        if (!await isLinkTaskWithinAcceptedMemorization(connection, task)) {
          await connection.rollback();
          return res.status(409).json({
            message: 'تغيّر مقدار المحفوظ، أعد فتح التنفيذ ليظهر الربط الصحيح.',
            code: 'STALE_LINK_TASK',
          });
        }
      }
    }
    if (!canStudentExecuteQuranTask(settings, first.taskType)) {
      await connection.rollback();
      return res.status(409).json({ message: 'تنفيذ هذه المهمة يتم عن طريق المعلم.' });
    }
    if (taskRows.some((task) => task.executionActorRole === 'teacher')) {
      await connection.rollback();
      return res.status(409).json({ message: 'سبق أن اعتمد المعلم تنفيذ هذه المهمة.' });
    }


  return null;
}

/** Validate the plan date, review schedule and Quran bounds before taking write locks. */
async function rejectInvalidPlanInputs({ requestedStartDate, reviewSplitWeekly, reviewWeekStartDay, reviewWeekEndDay, planSettings, studentId, requestedStartPage, requestedEndPage, startSurah, startAyah, endSurah, endAyah, res }) {
if (!isValidDateOnly(requestedStartDate)) {
      return res.status(422).json({ message: 'بداية الخطة غير صحيحة.' });
    }
    if (reviewSplitWeekly) {
      const reviewDays = getPlanReviewDays({
        reviewWeekStartDay,
        reviewWeekEndDay,
      }, planSettings);
      if (reviewDays.length === 0) {
        return res.status(422).json({ message: 'اختر أيام مراجعة لا تكون كلها ضمن الإجازة الأسبوعية.' });
      }
    }

    if (!studentId || (!requestedStartPage && (!startSurah || !startAyah)) || (!requestedEndPage && (!endSurah || !endAyah))) {
      return res.status(422).json({ message: 'بيانات الخطة مطلوبة.' });
    }
    if ((requestedStartPage || requestedEndPage) && (!isValidQuranPageNumber(requestedStartPage) || !isValidQuranPageNumber(requestedEndPage))) {
      return res.status(422).json({ message: 'نطاق صفحات الخطة غير صحيح.' });
    }


  return null;
}

/** Validate the bounded date range and supported task and status filters. */
/** Reject unsupported recipients, oversized messages and invalid attachments before sending. */
async function rejectInvalidWhatsAppMessage({ recipientType, selectedIds, messageTemplate, attachment, res }) {
if (!recipientType) {
      return res.status(422).json({ message: 'نوع المستلمين غير صحيح.' });
    }
    if (selectedIds.length > 500) {
      return res.status(422).json({ message: 'الحد الأعلى للإرسال في العملية الواحدة هو 500 مستلم.' });
    }
    if (messageTemplate.length > 5000) {
      return res.status(422).json({ message: 'نص الرسالة أطول من الحد المسموح.' });
    }
    if (attachment && !allowedWhatsAppAttachmentTypes.has(attachment.type)) {
      return res.status(422).json({ message: 'نوع المرفق غير مسموح.' });
    }
    if (attachment && !/^[A-Za-z0-9+/]+={0,2}$/.test(attachment.data)) {
      return res.status(422).json({ message: 'بيانات المرفق غير صحيحة.' });
    }
    if (attachment && attachment.data.length > 16 * 1024 * 1024) {
      return res.status(413).json({ message: 'حجم المرفق أكبر من الحد المسموح.' });
    }

    if (selectedIds.length === 0) {
      return res.status(422).json({ message: 'اختر مستلماً واحداً على الأقل.' });
    }

    if (!messageTemplate) {
      return res.status(422).json({ message: 'اكتب نص الرسالة.' });
    }


  return null;
}

/** Return an existing idempotent attempt and reject retired attempts without duplicating evaluation. */
async function replyToExistingRecitationAttempt({ requestId, connection, taskId, res }) {
if (requestId) {
      const [[existingAttempt]] = await connection.query(
        `SELECT
          is_official AS isOfficial,
          attempt_number AS attemptNumber,
          warning_count AS warningCount,
          mistake_count AS mistakeCount,
          evaluation_score AS evaluationScore,
          evaluation_max_score AS evaluationMaxScore,
          teacher_completed AS teacherCompleted
        FROM student_quran_recitation_attempts
        WHERE task_id = ? AND request_id = ?
        LIMIT 1`,
        [taskId, requestId]
      );
      if (existingAttempt) {
        await connection.rollback();
        if (!Number(existingAttempt.isOfficial)) return res.status(409).json({
          code: 'RETIRED_RECITATION_ATTEMPT',
          message: 'هذه المحاولة لم تعد معتمدة. أعد فتح جلسة التسميع للتحقق من النتيجة الحالية.',
        });
        return res.json({
          ok: true,
          duplicate: true,
          ...existingAttempt,
          teacherCompleted: Boolean(existingAttempt.teacherCompleted),
        });
      }
    }

  return null;
}

/** Require assigned-student access and an enabled attendance mode before writing attendance. */
async function rejectDisabledAttendanceMode({ manualMode, teacherMode, req, settings, res }) {
if (
      manualMode
      && req.auth?.role === 'supervisor'
      && !await hasSupervisorStudentPlanAccess(req, req.params.id)
    ) {
      return res.status(403).json({ message: 'يمكنك تحضير طلاب حلقاتك فقط.' });
    }
    if (manualMode && !teacherMode && !settings.attendanceManualEnabled) {
      return res.status(403).json({ message: 'التحضير اليدوي معطل من الإعدادات.' });
    }
    if (!manualMode && !settings.attendanceAccountEnabled) {
      return res.status(403).json({ message: 'التحضير عن طريق الحسابات معطل.' });
    }

  return null;
}

/** Normalize ranking visibility and point/store controls from persisted string settings. */
function normalizeRankingAndStoreSettings(settings) {
  return {
    rankingsVisible: settings.rankingsVisible !== 'false',
    studentRankingsVisible: settings.studentRankingsVisible === undefined
      ? settings.rankingsVisible !== 'false'
      : settings.studentRankingsVisible !== 'false',
    familyRankingsVisible: settings.familyRankingsVisible === undefined
      ? settings.rankingsVisible !== 'false'
      : settings.familyRankingsVisible !== 'false',
    familyRankingMode: normalizeFamilyRankingMode(settings.familyRankingMode),
    rankingPointsVisible: settings.rankingPointsVisible !== 'false',
    teacherManualPointsEnabled: settings.teacherManualPointsEnabled === 'true',
    teacherManualPointsTermLimit: Math.max(0, Math.trunc(Number(settings.teacherManualPointsTermLimit ?? 100))),
    teacherPointTypes: normalizeTeacherPointTypes(settings.teacherPointTypes),
    storeEnabled: siteConfig.features?.store !== false && settings.storeEnabled === 'true',
    storePurchaseDeductsRanking: settings.storePurchaseDeductsRanking === 'true',
  };
}

/** Reject invalid Mushaf marks and mismatched manual-mode payloads. */
async function rejectInvalidNarrationMarks({ evaluationMode, normalizedWordMarks, req, res }) {
  if (evaluationMode === 'mushaf' && normalizedWordMarks === null) return res.status(422).json({ message: 'تحديد أخطاء المصحف غير صحيح.' });
  if (evaluationMode === 'count' && Array.isArray(req.body.wordMarks)) return res.status(422).json({ message: 'لا ترسل علامات كلمات مع النتيجة اليدوية.' });

  return null;
}

/** Validate the selected student, adjustment type and note before taking point locks. */
async function rejectInvalidTeacherPointInput({ studentId, adjustmentTypeId, note, res }) {
  if (!studentId) return res.status(422).json({ message: 'اختر الطالب.' });
  if (!adjustmentTypeId) return res.status(422).json({ message: 'اختر نوع العملية.' });
  if (note.length > 400) return res.status(422).json({ message: 'الملاحظة طويلة جدًا.' });


  return null;
}

/** Reject missing, reversed or excessive execution endpoints before extending or writing tasks. */
async function rejectOutOfRangeExecution({ actualEnd, expectedStart, executionDirection, isExpectedCompletion, allowedEnd, connection, res }) {
  if (!actualEnd
    || compareQuranPositionInDirection(actualEnd, expectedStart, executionDirection) < 0
    || (!isExpectedCompletion && compareQuranPositionInDirection(actualEnd, allowedEnd, executionDirection) > 0)) {
    await connection.rollback();
    return res.status(422).json({ message: 'نهاية التنفيذ خارج الحد المسموح.' });
  }
  return null;
}

/** Require an existing student the current account is allowed to edit. */
async function rejectUneditableStudentPlan({ student, connection, res, req, studentId }) {
  if (!student) {
    await connection.rollback();
    return res.status(404).json({ message: 'الطالب غير موجود.' });
  }
  if (req.auth?.role === 'supervisor' && !await hasSupervisorStudentPlanAccess(req, studentId)) {
    await connection.rollback();
    return res.status(403).json({ message: 'لا يمكنك تعديل خطة طالب خارج حلقاتك.' });
  }
  return null;
}

/** Reject future, non-session and disallowed early attendance before checking location. */
async function rejectInvalidAttendanceTime({ date, now, settings, manualMode, time, res }) {
  if (date > now.date) {
    return res.status(422).json({ message: 'لا يمكن تسجيل الحضور في تاريخ مستقبلي.' });
  }
  const isToday = date === now.date;
  if (!isRecitationSessionDay(date, settings)) {
    return res.status(403).json({ message: 'لا توجد جلسة تسميع في هذا اليوم.' });
  }
  if (!manualMode && !settings.allowEarlyAttendance && isToday && isBeforeAttendanceStart(settings, time)) {
    return res.status(403).json({ message: 'التحضير قبل الوقت المحدد غير مسموح.' });
  }

  return null;
}

/** Reject missing page boundaries before deriving plan coordinates. */
async function rejectMissingPlanPageBoundary({ requestedStartPage, requestedStartBoundary, requestedEndPage, requestedEndBoundary, connection, res }) {
  if ((requestedStartPage && !requestedStartBoundary) || (requestedEndPage && !requestedEndBoundary)) {
    await connection.rollback();
    return res.status(422).json({ message: 'رقم الصفحة غير صحيح.' });
  }
  return null;
}

/** Respect the configured student permission to change the execution endpoint. */
async function rejectDisabledExecutionEndChange({ settings, first, endComparison, connection, res }) {
  if (!canStudentSetQuranTaskEnd(settings, first.taskType, endComparison)) {
    await connection.rollback();
    return res.status(422).json({ message: 'تعديل نهاية المقدار غير مسموح حسب الإعدادات.' });
  }
  return null;
}

/** Commit the existing claim state and reject a duplicate daily recitation without changing its evaluation. */
async function replyToRejectedRecitationClaim({ sessionClaim, connection, res }) {
  if (!sessionClaim.accepted) {
    await connection.commit();
    return res.status(409).json({
      message: 'تم تسميع الطالب اليوم بالفعل.',
      code: 'REJECTED_DUPLICATE',
      sessionId: sessionClaim.sessionId,
      winningSessionId: sessionClaim.winningSessionId,
    });
  }
  return null;
}

/** Reject a new plan beginning before the permitted current-term date. */
async function rejectPastNewPlanStart({ existingPlan, startDate, minimumPlanStartDate, connection, res }) {
  if (!existingPlan && startDate < minimumPlanStartDate) {
    await connection.rollback();
    return res.status(422).json({ message: `بداية الخطة يجب ألا تسبق ${minimumPlanStartDate}.` });
  }
  return null;
}

/** Reject a plan whose entire selected range is already memorized. */
async function rejectFullyMemorizedPlan({ memorizedPlanAyahs, connection, res }) {
  if (memorizedPlanAyahs.totalAyahs > 0 && memorizedPlanAyahs.memorizedAyahs >= memorizedPlanAyahs.totalAyahs) {
    await connection.rollback();
    return res.status(422).json({ message: 'نطاق الخطة المحدد محفوظ بالكامل. اختر صفحات غير محفوظة.' });
  }
  return null;
}

/** Reject execution by any account other than the owning student. */
async function rejectForeignStudentExecution({ req, studentId, res }) {
  if (req.auth?.role !== 'student' || Number(req.auth.id) !== studentId) {
    return res.status(403).json({ message: 'تنفيذ الخطة متاح للطالب صاحب الحساب فقط.' });
  }
  return null;
}

/** Reject a task group when any owned unevaluated task is missing under the transaction lock. */
async function rejectMissingExecutionTasks({ taskRows, taskIds, connection, res }) {
  if (taskRows.length !== taskIds.length) {
    await connection.rollback();
    return res.status(404).json({ message: 'بعض المهام غير موجودة أو تم تقييمها.' });
  }
  return null;
}

function resolveRecitationRequestDate(requested, today) {
  const value = requested || today;
  return isValidDateOnly(value) ? String(value) : today;
}
