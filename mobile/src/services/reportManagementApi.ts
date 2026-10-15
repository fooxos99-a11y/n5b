import type { NativeSession, NativeSessionController } from '../domain/nativeSession';
import { canReadStandardReports, decodeGradingSessions, decodeReportArchive, decodeReportArchives, decodeReportBalances, decodeReportCircles,
  decodeReportComplexes, decodeReportOverview, decodeReportSettings, decodeReportTable, decodeTeacherPoints, freezeReportData, normalizeReportQuery,
  reportGrants, reportObject, reportQueryKey, type ReportArchive, type ReportCircle, type ReportDetailKind, type ReportGradingSessions,
  type ReportManagementData, type ReportManagementQuery, type ReportScopeId, type ReportSettings, type ReportStudentBalance, type ReportTable } from '../domain/reportManagement';
import { studentAttendanceSessionDate } from '../domain/attendanceManagement';
import { decodeAttendancePolicy, decodeAttendanceRows } from './attendanceManagementApi';
import { NativeApiError } from './nativeApi';
import { getSaudiCalendarDate } from '../../../shared/business-date.js';

interface PendingArchiveDeletion { id: number; expectedSnapshot: string }
const pendingByController = new WeakMap<NativeSessionController, Map<string, PendingArchiveDeletion>>();
const runningByController = new WeakMap<NativeSessionController, Set<string>>();
interface ReportPublicSettings { settings: ReportSettings; raw: Record<string, unknown> }
type DetailQuery = Pick<ReportManagementQuery, 'from' | 'to' | 'committeeId' | 'complexId'>;
export function createReportManagementApi(controller: NativeSessionController) {
  const initial = controller.getSnapshot(), actor = initial.session;
  if (initial.status !== 'authenticated' || !actor) throw new NativeApiError('unauthorized');
  const context = JSON.stringify([actor.role, actor.id, actor.complex.registrationNumber]);
  const pending = pendingByController.get(controller) ?? new Map<string, PendingArchiveDeletion>(); pendingByController.set(controller, pending);
  const running = runningByController.get(controller) ?? new Set<string>(); runningByController.set(controller, running);
  function current(): NativeSession {
    const state = controller.getSnapshot(), identity = state.session;
    if (state.status !== 'authenticated' || !identity) throw new NativeApiError('unauthorized');
    if (context !== JSON.stringify([identity.role, identity.id, identity.complex.registrationNumber])) throw new NativeApiError('cancelled');
    if (!canReadStandardReports(identity)) throw new NativeApiError('forbidden'); return identity;
  }
  current();
  function archiveAccess() { const identity = current(); if (!['manager', 'admin'].includes(identity.role)) throw new NativeApiError('forbidden'); }
  async function request<T>(path: string, options: Parameters<NativeSessionController['request']>[1], decode: (value: unknown) => T, guard: () => void = current, onDispatch?: () => void): Promise<T> {
    guard();
    try { onDispatch?.(); const value = await controller.request(path, options, decode); guard(); return value; }
    catch (cause) { guard(); throw cause; }
  }
  const publicSettings = (signal?: AbortSignal) => request('/public-settings', { signal }, value => ({ settings: decodeReportSettings(value), raw: reportObject(value) }));
  function requireFeature(settings: ReportSettings) { if (!reportGrants(current(), settings).canViewStandardReports) throw new NativeApiError('forbidden'); }
  const archives = (signal?: AbortSignal) => request('/reports/archives', { signal }, decodeReportArchives, archiveAccess);
  const archive = (id: number, signal?: AbortSignal) => request(`/reports/archives/${id}`, { signal }, value => decodeReportArchive(value, id), archiveAccess);
  const circles = (signal?: AbortSignal) => request('/reports/committees', { signal }, decodeReportCircles);
  function params(query: DetailQuery) { return new URLSearchParams({ from: query.from, to: query.to, committeeId: String(query.committeeId) }); }
  function overview(query: DetailQuery, signal?: AbortSignal) {
    const queryParams = params(query); queryParams.set('complexId', String(query.complexId));
    return request(`/reports/overview?${queryParams}`, { signal }, value => decodeReportOverview(value, query));
  }
  async function absent(id: number, signal?: AbortSignal) {
    archiveAccess();
    try { await archive(id, signal); throw new NativeApiError('invalid-response'); }
    catch (cause) { archiveAccess(); if (!(cause instanceof NativeApiError) || cause.code !== 'not-found') throw cause; }
  }
  async function reconcile(rows: Awaited<ReturnType<typeof archives>>, signal?: AbortSignal): Promise<number | null> {
    const operation = pending.get(context); if (!operation) return null;
    archiveAccess(); if (rows.some(row => row.id === operation.id)) throw new NativeApiError('conflict');
    await absent(operation.id, signal); pending.delete(context); return operation.id;
  }
  function selectedCircles(query: DetailQuery, refs: readonly ReportCircle[]): ReportScopeId[] {
    if (query.committeeId !== 'all') {
      if (query.complexId !== 'all' && !refs.some(row => row.id === query.committeeId && row.complexId === query.complexId)) throw new NativeApiError('validation');
      return [query.committeeId];
    }
    return query.complexId === 'all' ? ['all'] : refs.filter(row => row.complexId === query.complexId).map(row => row.id);
  }
  async function balances(query: DetailQuery, signal?: AbortSignal, refs?: readonly ReportCircle[]): Promise<ReportStudentBalance[]> {
    const identity = current();
    if (identity.role === 'supervisor') {
      // The legacy point-report routes do not restrict the supervisor; this roster does.
      const rows = await request('/students', { signal }, decodeReportBalances);
      const allowed = query.complexId === 'all' ? null : new Set((refs ?? await circles(signal)).filter(row => row.complexId === query.complexId).map(row => row.id));
      return rows.filter(row => (query.committeeId === 'all' || row.committeeId === query.committeeId) && (!allowed || (row.committeeId !== null && allowed.has(row.committeeId))));
    }
    const scopes = selectedCircles(query, refs ?? (query.complexId === 'all' ? [] : await circles(signal)));
    const result: ReportStudentBalance[] = [];
    for (const committeeId of scopes) {
      const suffix = committeeId === 'all' ? '' : `?${new URLSearchParams({ committeeId: String(committeeId) })}`;
      result.push(...await request(`/reports/student-points${suffix}`, { signal }, decodeReportBalances));
    }
    if (new Set(result.map(row => row.id)).size !== result.length) throw new NativeApiError('invalid-response'); return result;
  }
  async function grading(query: DetailQuery, component: 'weekly' | 'track', signal?: AbortSignal, refs?: readonly ReportCircle[]): Promise<ReportGradingSessions> {
    const scopes = selectedCircles(query, refs ?? (query.complexId === 'all' ? [] : await circles(signal)));
    const result: ReportGradingSessions = { period: { from: query.from, to: query.to }, rows: [], compensations: [] };
    for (const committeeId of scopes) {
      const queryParams = params({ ...query, committeeId }); queryParams.set('component', component);
      const report = await request(`/reports/grading-sessions?${queryParams}`, { signal }, value => decodeGradingSessions(value, query));
      result.rows.push(...report.rows); result.compensations.push(...report.compensations);
    }
    if (new Set(result.rows.map(row => row.id)).size !== result.rows.length) throw new NativeApiError('invalid-response');
    return result;
  }
  async function staff(query: DetailQuery, signal?: AbortSignal): Promise<ReportTable> {
    const identity = current();
    const ids = query.committeeId === 'all' && query.complexId === 'all' ? [identity.role === 'supervisor' ? identity.id : null]
      : (await overview(query, signal)).teachers?.map(row => row.id);
    if (!ids) throw new NativeApiError('invalid-response');
    const result: ReportTable = { period: { from: query.from, to: query.to }, rows: [] };
    for (const id of ids) {
      const queryParams = new URLSearchParams({ from: query.from, to: query.to }); if (id !== null) queryParams.set('staffId', String(id));
      const table = await request(`/reports/supervisors?${queryParams}`, { signal }, decodeReportTable); result.rows.push(...table.rows);
    }
    return result;
  }
  async function detail(kind: ReportDetailKind, query: DetailQuery, publicData: ReportPublicSettings, signal?: AbortSignal, refs?: readonly ReportCircle[]): Promise<ReportTable> {
    if (kind === 'studentPoints') return decodeReportTable({ rows: await balances(query, signal, refs) });
    if (kind === 'weekly' || kind === 'track') return decodeReportTable(await grading(query, kind, signal, refs), query);
    if (kind === 'supervisors') return staff(query, signal);
    const scopes = selectedCircles(query, refs ?? (query.complexId === 'all' ? [] : await circles(signal)));
    let combined: ReportTable = { rows: [] };
    const endpoint = { students: '/reports/students', progress: '/reports/progress', recitations: '/reports/recitation-sessions', saved: '/reports/student-saved' }[kind];
    for (const committeeId of scopes) {
      let table: ReportTable;
      if (kind === 'students') {
        const effectiveDate = studentAttendanceSessionDate(query.to, decodeAttendancePolicy(publicData.raw).recitationSessionDays);
        const queryParams = new URLSearchParams({ date: query.to, committeeId: String(committeeId) });
        const rows = await request(`${endpoint}?${queryParams}`, { signal }, value => decodeAttendanceRows(value, 'students', effectiveDate));
        table = { rows: rows.map(row => ({ ...row })), requestedDate: query.to, effectiveDate };
      } else {
        table = await request(`${endpoint}?${params({ ...query, committeeId })}`, { signal }, value => decodeReportTable(value, query));
      }
      combined.rows.push(...table.rows);
      if (scopes.length === 1) combined = { ...table, rows: combined.rows };
    }
    if (scopes.length !== 1 && kind !== 'students') combined.period = { from: query.from, to: query.to, committeeId: 'all' };
    if (kind === 'students' && !combined.effectiveDate) { combined.effectiveDate = studentAttendanceSessionDate(query.to, decodeAttendancePolicy(publicData.raw).recitationSessionDays); combined.requestedDate = query.to; }
    if (['students', 'progress'].includes(kind) && new Set(combined.rows.map(row => row.id)).size !== combined.rows.length) throw new NativeApiError('invalid-response');
    return combined;
  }
  function guardRead(query: ReportManagementQuery) { current(); const normalized = normalizeReportQuery(query); if (normalized.archiveId) archiveAccess(); return normalized; }
  return {
    queryKey: (query: ReportManagementQuery) => reportQueryKey(query, context),
    hasUncertainOperation: () => pending.has(context),
    async load(query: ReportManagementQuery, signal?: AbortSignal): Promise<ReportManagementData> {
      let selected = guardRead(query); if (running.has(context)) throw new NativeApiError('conflict');
      const publicData = await publicSettings(signal); requireFeature(publicData.settings);
      const identity = current(), grants = reportGrants(identity, publicData.settings);
      const archiveRows = grants.canManageArchives ? await archives(signal) : [];
      const reconciledArchiveDeletion = await reconcile(archiveRows, signal);
      if (reconciledArchiveDeletion === selected.archiveId) { const live = { ...selected }; delete live.archiveId; selected = normalizeReportQuery(live); }
      const managerMetadata = !grants.teacherScoped && !selected.archiveId;
      const [committeeRows, complexRows] = managerMetadata ? await Promise.all([circles(signal), request('/complexes', { signal }, decodeReportComplexes)]) : [[], []];
      let storedArchive: ReportArchive | null = null, reportOverview: ReportManagementData['overview'] = null, reportDetail: ReportTable | null = null;
      const kind = selected.reportType ?? 'overview';
      if (selected.archiveId) { storedArchive = await archive(selected.archiveId, signal); reportOverview = storedArchive.overviewReport; }
      else if (kind === 'overview') reportOverview = await overview(selected, signal);
      else reportDetail = await detail(kind, selected, publicData, signal, managerMetadata ? committeeRows : undefined);
      const teacherPoints = grants.canViewTeacherPoints && !selected.archiveId && kind === 'overview' ? await request(`/reports/teacher-points?${new URLSearchParams({ from: selected.from, to: selected.to, committeeId: String(selected.committeeId), complexId: String(selected.complexId) })}`, { signal }, value => decodeTeacherPoints(value, selected)) : null;
      const finalIdentity = current();
      return freezeReportData({ query: selected, queryKey: reportQueryKey(selected, context), actor: { role: finalIdentity.role, id: finalIdentity.id, name: finalIdentity.name }, grants,
        settings: publicData.settings, committees: committeeRows, complexes: complexRows, archives: archiveRows, archive: storedArchive,
        overview: reportOverview, teacherPoints, detail: reportDetail, reconciledArchiveDeletion });
    },
    async loadStudentPoints(query: { committeeId: ReportScopeId; complexId?: ReportScopeId }, signal?: AbortSignal) {
      const today = getSaudiCalendarDate();
      const selected = guardRead({ from: today, to: today, complexId: query.complexId ?? 'all', committeeId: query.committeeId });
      const data = await publicSettings(signal); requireFeature(data.settings); return balances(selected, signal);
    },
    async loadGradingSessions(query: { component: 'weekly' | 'track'; from: string; to: string; committeeId: ReportScopeId; complexId?: ReportScopeId }, signal?: AbortSignal) {
      const selected = guardRead({ ...query, complexId: query.complexId ?? 'all' });
      if (!['weekly', 'track'].includes(query.component)) throw new NativeApiError('validation');
      const data = await publicSettings(signal); requireFeature(data.settings); return grading(selected, query.component, signal);
    },
    async deleteArchive({ id, expectedArchive }: { id: number; expectedArchive: ReportArchive }): Promise<{ verified: true; id: number }> {
      archiveAccess(); if (!expectedArchive || !Number.isSafeInteger(id) || id <= 0 || id !== expectedArchive.id || typeof expectedArchive.snapshot !== 'string' || !expectedArchive.snapshot) throw new NativeApiError('validation');
      if (pending.has(context) || running.has(context)) throw new NativeApiError('conflict');
      running.add(context); let dispatched = false, acknowledged = false;
      try {
        const data = await publicSettings(); requireFeature(data.settings);
        const fresh = await archive(id); if (fresh.snapshot !== expectedArchive.snapshot) throw new NativeApiError('conflict', 409);
        pending.set(context, { id, expectedSnapshot: expectedArchive.snapshot });
        await request(`/reports/archives/${id}`, { method: 'DELETE' }, value => {
          if (reportObject(value).ok !== true) throw new NativeApiError('invalid-response'); acknowledged = true; return true;
        }, archiveAccess, () => { dispatched = true; });
        const rows = await archives(); if (rows.some(row => row.id === id)) throw new NativeApiError('invalid-response');
        await absent(id); pending.delete(context); return { verified: true, id };
      } catch (cause) {
        const rejectedBeforeMutation = cause instanceof NativeApiError && !!cause.status && cause.status >= 400 && cause.status < 500;
        if (!dispatched || (!acknowledged && rejectedBeforeMutation)) pending.delete(context);
        throw cause;
      } finally { running.delete(context); }
    },
  };
}
export type ReportManagementApi = ReturnType<typeof createReportManagementApi>;
