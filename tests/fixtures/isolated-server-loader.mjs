import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
// Test-only loader: expose production functions without listening, background jobs or external integrations.
const entry = new URL('../../server/index.js', import.meta.url).href;
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (url !== entry) return result;
  let source = (typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8')).replaceAll('\r\n', '\n');
  const start = source.indexOf('try {\n    await initDatabase();');
  const end = source.indexOf("import { nativeUpdatePolicy }", start);
  if (start < 0 || end < 0) throw new Error('Server bootstrap changed; review the isolated test loader.');
  source = source.slice(0, start) + source.slice(end);
  source = source.replace('startRuntimeDiagnostics();', '');
  source += '\nexport { ensureStudentPlanTasks, getActivePlanForStudent, loadSettings, removePriorMemorizationPageRange, getPriorMemorizationRangesForStudent, rateSupervisorQuranTaskHandler, runRecitationTaskHandler, buildRecitationSessionsReport, buildOverviewReport, app };\n';
  return { ...result, source };
}
