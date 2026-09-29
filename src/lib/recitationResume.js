// Mobile browsers can resume a suspended tab without firing window.focus.
export function subscribeRecitationResume({ windowTarget, documentTarget, isOnline, refresh }) {
  const resume = () => {
    if (isOnline() && documentTarget.visibilityState === 'visible') refresh();
  };
  windowTarget.addEventListener('focus', resume);
  windowTarget.addEventListener('online', resume);
  documentTarget.addEventListener('visibilitychange', resume);
  return () => {
    windowTarget.removeEventListener('focus', resume);
    windowTarget.removeEventListener('online', resume);
    documentTarget.removeEventListener('visibilitychange', resume);
  };
}
