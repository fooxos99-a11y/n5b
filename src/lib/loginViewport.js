// Keep keyboard resizing and scrolling inside the form, without scrolling the document.
export function trackLoginViewport(windowTarget, root, content) {
  const viewport = windowTarget.visualViewport;
  const documentTarget = root.ownerDocument;
  let frame;
  let width = windowTarget.innerWidth;
  let fullHeight = Math.max(windowTarget.innerHeight, viewport?.height || 0);
  const update = () => {
    const height = viewport?.height || windowTarget.innerHeight;
    if (width !== windowTarget.innerWidth) {
      width = windowTarget.innerWidth;
      fullHeight = Math.max(windowTarget.innerHeight, height);
    }
    fullHeight = Math.max(fullHeight, windowTarget.innerHeight, height);
    root.style.setProperty('--login-viewport-height', `${height}px`);
    root.style.setProperty('--login-viewport-top', `${Math.max(0, viewport?.offsetTop || 0)}px`);
    root.dataset.loginKeyboard = fullHeight - height > 120 ? 'open' : 'closed';
    const input = documentTarget.activeElement;
    if (!content || !content.contains(input) || !input.matches('.account-login-input')) return;
    const bounds = content.getBoundingClientRect();
    const field = input.getBoundingClientRect();
    if (field.bottom > bounds.bottom - 8) content.scrollTop += field.bottom - bounds.bottom + 8;
    else if (field.top < bounds.top + 8) content.scrollTop -= bounds.top + 8 - field.top;
  };
  const schedule = () => {
    windowTarget.cancelAnimationFrame(frame);
    frame = windowTarget.requestAnimationFrame(update);
  };
  update();
  windowTarget.addEventListener('resize', schedule);
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  documentTarget.addEventListener('focusin', schedule);
  documentTarget.addEventListener('focusout', schedule);
  return () => {
    windowTarget.cancelAnimationFrame(frame);
    windowTarget.removeEventListener('resize', schedule);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    documentTarget.removeEventListener('focusin', schedule);
    documentTarget.removeEventListener('focusout', schedule);
    root.style.removeProperty('--login-viewport-height');
    root.style.removeProperty('--login-viewport-top');
    delete root.dataset.loginKeyboard;
  };
}
