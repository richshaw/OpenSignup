const KEY_PREFIX = 'opensignup:ai-draft-warnings:';

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function writeAiDraftWarnings(signupId: string, warnings: string[]): void {
  const s = storage();
  if (!s) return;
  if (warnings.length === 0) {
    try {
      s.removeItem(`${KEY_PREFIX}${signupId}`);
    } catch {
      // quota / disabled
    }
    return;
  }
  try {
    s.setItem(`${KEY_PREFIX}${signupId}`, JSON.stringify(warnings));
  } catch {
    // quota / disabled — falling back to no banner content is fine.
  }
}

export function readAiDraftWarnings(signupId: string): string[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(`${KEY_PREFIX}${signupId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, 10);
  } catch {
    return [];
  }
}

export function clearAiDraftWarnings(signupId: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(`${KEY_PREFIX}${signupId}`);
  } catch {
    // ignore
  }
}
