const RECOVERY_STORAGE_KEY = 'nukhab_stale_asset_recovery';
const RECOVERY_COOLDOWN_MS = 30_000;
const STALE_ASSET_ERROR = /Failed to fetch dynamically imported module|Loading chunk \d+ failed|ChunkLoadError|Importing a module script failed/i;

export function recoverFromStaleAppAsset(error) {
  const message = String(error?.message || error || '');
  if (message && !STALE_ASSET_ERROR.test(message)) return false;
  try {
    const lastRecovery = Number(sessionStorage.getItem(RECOVERY_STORAGE_KEY) || 0);
    if (Date.now() - lastRecovery < RECOVERY_COOLDOWN_MS) return false;
    sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(Date.now()));
  } catch {
    // A blocked sessionStorage must not prevent recovery from a stale application bundle.
  }
  window.location.reload();
  return true;
}
