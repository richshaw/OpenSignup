/**
 * Rejects with `message` if `promise` hasn't settled within `ms`. The work
 * itself isn't cancelled: it keeps running, and its result is dropped unless
 * `onLateSettle` is given, which hears how work that outlived the limit ended.
 * Anything `onLateSettle` throws is swallowed.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
  { onLateSettle }: { onLateSettle?: (result: PromiseSettledResult<T>) => void } = {},
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(message));
    }, ms);
  });
  if (onLateSettle) {
    const report = (result: PromiseSettledResult<T>) => {
      if (!timedOut) return;
      // Nobody is waiting on this by now, so a throw would surface as an
      // unhandled rejection, which can stop a Node process. The callback
      // is usually a log line, and that is what failed, so drop it.
      try {
        onLateSettle(result);
      } catch {
        // Nowhere left to report it.
      }
    };
    void promise.then(
      (value) => report({ status: 'fulfilled', value }),
      (reason: unknown) => report({ status: 'rejected', reason }),
    );
  }
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
