import { Buffer } from 'node:buffer';

const entry = new URL('../server/index.js', import.meta.url).href;
const environment = new URL('../server/loadEnvironment.js', import.meta.url).href;
let enabled = false;
export function initialize(data) { enabled = data?.localCallArchive === true; }

/** Preserve the production app verbatim; only its unrelated process boot is suppressed. */
export function isolateLocalCallArchiveSource(raw) {
  let source = String(raw).replaceAll('\r\n', '\n');
  const start = '\ntry {\n    await initDatabase();';
  const end = '\nimport { nativeUpdatePolicy }';
  if (source.split(start).length !== 2 || source.split('\nstartRuntimeDiagnostics();\n').length !== 2) throw new Error('Production startup changed; review the local call API loader before running it.');
  const from = source.indexOf(start), to = source.indexOf(end, from);
  const boot = source.slice(from, to);
  if (to < from || boot.includes('refreshWhatsAppState(') || !['await initPlatformDatabase(currentComplex);', 'await ensureManagerSupervisorAccount();', 'await reconcileAllTenantStartupState();', 'startAutomaticAbsenceScheduler();', 'app.listen(port, process.env.API_HOST || undefined);', 'process.exit(1);'].every(text => boot.includes(text))) throw new Error('Production startup boundaries changed; local API startup was refused.');
  source = source.slice(0, from) + '\n' + source.slice(to);
  source = source.replace('\nstartRuntimeDiagnostics();\n', '\n');
  return source + '\nexport { app as localCallArchiveApp };\n';
}

export async function load(url, context, nextLoad) {
  if (!enabled) throw new Error('The local call API loader requires its validated launcher.');
  // The launcher already loaded its explicit file. Never fall back to a normal .env.
  if (url === environment) return { format: 'module', shortCircuit: true, source: 'export {};\n' };
  const result = await nextLoad(url, context);
  if (url !== entry) return result;
  const source = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
  return { ...result, source: isolateLocalCallArchiveSource(source) };
}
