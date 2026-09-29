export function singleFlight(run, keyFor) {
  const pending = new Map();
  return (...args) => {
    const key = keyFor(...args);
    if (pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(() => run(...args)).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };
}

// A refresh after a mutation must not share a transport started before it.
export function refreshableSingleFlight(run, keyFor) {
  const pending = new Map();
  return (id, { fresh = false } = {}) => {
    const key = keyFor(id);
    if (!fresh && pending.has(key)) return pending.get(key);
    const promise = Promise.resolve().then(() => run(id)).finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
    pending.set(key, promise);
    return promise;
  };
}

export function limitedTaskQueue(run, keyFor, concurrency = 4) {
  const pending = new Map();
  const queue = [];
  let running = 0;
  const advance = () => {
    while (running < concurrency && queue.length) {
      const { args, resolve, reject, key } = queue.shift();
      running += 1;
      void Promise.resolve().then(() => run(...args)).then(resolve, reject).finally(() => {
        running -= 1;
        pending.delete(key);
        advance();
      });
    }
  };
  return (...args) => {
    const key = keyFor(...args);
    if (pending.has(key)) return pending.get(key);
    const promise = new Promise((resolve, reject) => queue.push({ args, resolve, reject, key }));
    pending.set(key, promise);
    advance();
    return promise;
  };
}
