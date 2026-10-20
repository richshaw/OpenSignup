const KEY_PREFIX = 'opensignup:ai-draft-warnings:';

/**
 * Run `fn` against sessionStorage, or return `fallback` when there is none
 * (server render) or it throws (disabled, quota, private mode). Losing the
 * banner's warnings is fine; breaking the page over them is not.
 */
function withStorage<T>(fallback: T, fn: (s: Storage) => T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    return fn(window.sessionStorage);
  } catch {
    return fallback;
  }
}

export function writeAiDraftWarnings(signupId: string, warnings: string[]): void {
  if (warnings.length === 0) {
    clearAiDraftWarnings(signupId);
    return;
  }
  withStorage(undefined, (s) => s.setItem(`${KEY_PREFIX}${signupId}`, JSON.stringify(warnings)));
}

export function readAiDraftWarnings(signupId: string): string[] {
  return withStorage([], (s) => {
    const raw = s.getItem(`${KEY_PREFIX}${signupId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, 10);
  });
}

export function clearAiDraftWarnings(signupId: string): void {
  withStorage(undefined, (s) => s.removeItem(`${KEY_PREFIX}${signupId}`));
}
