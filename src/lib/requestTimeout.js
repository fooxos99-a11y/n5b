const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export const prepareTimedRequest = (options = {}, fallbackTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) => {
  const {
    signal: externalSignal,
    timeoutMs = fallbackTimeoutMs,
    ...fetchOptions
  } = options;
  const controller = new AbortController();
  let timedOut = false;

  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternalSignal();
  else externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });

  const timeout = timeoutMs > 0
    ? globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs)
    : null;

  return {
    options: { ...fetchOptions, signal: controller.signal },
    didTimeOut: () => timedOut,
    cleanup: () => {
      if (timeout) globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternalSignal);
    },
  };
};

export const requestTimeoutMessage = 'استغرق الاتصال وقتًا أطول من المتوقع. لم يصل رد الخادم في الوقت المحدد. أعد المحاولة.';
