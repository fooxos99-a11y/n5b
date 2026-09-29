export function createSharedPreparation() {
  const pending = new Map();
  return (scope, prepare) => {
    if (pending.has(scope)) return pending.get(scope);
    const promise = Promise.resolve().then(prepare).finally(() => pending.delete(scope));
    pending.set(scope, promise);
    return promise;
  };
}
