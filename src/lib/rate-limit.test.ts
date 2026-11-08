import { describe, expect, it, vi } from 'vitest';
import { RateLimits } from './rate-limit';

// A lifetime other than the real 15 minutes, so a window typed as a number
// can't pass by matching it.
vi.mock('@/auth/login-code-lifetime', () => ({ LOGIN_CODE_MAX_AGE_MS: 10 * 60 * 1000 }));

describe('RateLimits', () => {
  it('gives both sign-in code buckets a window of one code lifetime', () => {
    expect(RateLimits.loginCodePerEmail.windowSeconds).toBe(600);
    expect(RateLimits.loginCodePerIp.windowSeconds).toBe(600);
  });
});
