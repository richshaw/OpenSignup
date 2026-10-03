/**
 * Rejects with `message` if `promise` hasn't settled within `ms`. The work
 * itself isn't cancelled: it keeps running, and its result is dropped unless
 * `onLateSettle` is given, which hears how work that outlived the limit ended.
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
    void promise.then(
      (value) => {
        if (timedOut) onLateSettle({ status: 'fulfilled', value });
      },
      (reason: unknown) => {
        if (timedOut) onLateSettle({ status: 'rejected', reason });
      },
    );
  }
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
