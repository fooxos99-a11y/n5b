import { useLayoutEffect, useRef } from 'react';
import type { DialogDismissOptions } from './dialogDismiss';

type DialogEntry = Omit<DialogDismissOptions, 'rendered'>;
const stack: DialogEntry[] = [];
let listening = false;
let escapePressed = false;

function stopListeningWhenIdle() {
  if (stack.length || escapePressed || !listening) return;
  document.removeEventListener('keydown', handleEscape, true);
  document.removeEventListener('keyup', handleEscape, true);
  window.removeEventListener('blur', resetHeldEscape);
  document.removeEventListener('visibilitychange', resetHiddenEscape);
  listening = false;
}
function resetHeldEscape() {
  escapePressed = false;
  stopListeningWhenIdle();
}
function resetHiddenEscape() {
  if (document.visibilityState === 'hidden') resetHeldEscape();
}
function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.isComposing) return;
  const top = stack.at(-1);
  if (!top && !escapePressed) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.type === 'keyup') {
    escapePressed = false;
    stopListeningWhenIdle();
    return;
  }
  const held = escapePressed;
  escapePressed = true;
  if (!held && top?.visible && !top.busy && !event.repeat) top.onClose();
}
function removeEntry(entry: DialogEntry) {
  const position = stack.indexOf(entry);
  if (position !== -1) stack.splice(position, 1);
  stopListeningWhenIdle();
}
function startListening() {
  if (listening) return;
  document.addEventListener('keydown', handleEscape, true);
  document.addEventListener('keyup', handleEscape, true);
  window.addEventListener('blur', resetHeldEscape);
  document.addEventListener('visibilitychange', resetHiddenEscape);
  listening = true;
}

export function useDialogDismiss({ visible, rendered, busy, onClose }: DialogDismissOptions) {
  const entry = useRef<DialogEntry>({ visible, busy, onClose }).current;
  // Updating a callback or busy flag must never put the parent above its child.
  useLayoutEffect(() => { entry.visible = visible; entry.busy = busy; entry.onClose = onClose; });
  useLayoutEffect(() => {
    if (!rendered) return;
    stack.push(entry);
    startListening();
    return () => removeEntry(entry);
  }, [entry, rendered]);
  useLayoutEffect(() => {
    if (!visible || !rendered) return;
    const position = stack.indexOf(entry);
    if (position !== -1) stack.splice(position, 1);
    stack.push(entry);
  }, [entry, visible, rendered]);
}
