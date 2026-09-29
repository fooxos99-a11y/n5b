let pendingPermission;

export async function requestNativeNotificationPermission(push) {
  const current = await push.checkPermissions();
  if (!['prompt', 'prompt-with-rationale'].includes(current.receive)) return current;
  if (!pendingPermission) {
    pendingPermission = push.requestPermissions().finally(() => { pendingPermission = null; });
  }
  return pendingPermission;
}
