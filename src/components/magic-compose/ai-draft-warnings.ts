import type { DraftWarning } from '@/lib/magic-compose/draft-warnings';

/**
 * The sessionStorage key a draft's AI warnings are kept under is this prefix
 * plus the signup's id. Exported so the cookies page names the real key.
 */
export const AI_DRAFT_WARNINGS_KEY_PREFIX = 'opensignup:ai-draft-warnings:';

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

/**
 * Keeps a new draft's warnings for its page's banner, as codes with their
 * arguments (`DraftWarning`): the banner words them in the organizer's
 * language when it shows them.
 */
export function writeAiDraftWarnings(signupId: string, warnings: readonly DraftWarning[]): void {
  if (warnings.length === 0) {
    clearAiDraftWarnings(signupId);
    return;
  }
  withStorage(undefined, (s) =>
    s.setItem(`${AI_DRAFT_WARNINGS_KEY_PREFIX}${signupId}`, JSON.stringify(warnings)),
  );
}

/**
 * What the tab kept for a draft, unchecked: the warnings box shows only the
 * entries that are warnings it knows (`isDraftWarning`), so an English
 * sentence kept by a tab opened before warnings had codes is left out there.
 * Checked there rather than here, so the check loads only with the box.
 */
export function readAiDraftWarnings(signupId: string): unknown[] {
  return withStorage([], (s) => {
    const raw = s.getItem(`${AI_DRAFT_WARNINGS_KEY_PREFIX}${signupId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  });
}

export function clearAiDraftWarnings(signupId: string): void {
  withStorage(undefined, (s) => s.removeItem(`${AI_DRAFT_WARNINGS_KEY_PREFIX}${signupId}`));
}
