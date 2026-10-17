import { describe, expect, it } from 'vitest';
import { rateLimitMessage } from './rate-limit-message';

const limited = (retryAfterSeconds: unknown) => ({
  code: 'rate_limited',
  details: { retryAfterSeconds, bucket: 'commit.ip' },
});

describe('rateLimitMessage', () => {
  it('says how many minutes to wait, rounded up', () => {
    expect(rateLimitMessage(limited(3412))).toStrictEqual({
      message: 'Too many tries just now.',
      suggestion: 'Try again in about 57 minutes.',
    });
    expect(rateLimitMessage(limited(61))?.suggestion).toBe('Try again in about 2 minutes.');
    expect(rateLimitMessage(limited(120))?.suggestion).toBe('Try again in about 2 minutes.');
  });

  it('says one minute, never less, for a short wait', () => {
    expect(rateLimitMessage(limited(60))?.suggestion).toBe('Try again in about 1 minute.');
    expect(rateLimitMessage(limited(5))?.suggestion).toBe('Try again in about 1 minute.');
    expect(rateLimitMessage(limited(0))?.suggestion).toBe('Try again in about 1 minute.');
  });

  it('never shows seconds', () => {
    expect(JSON.stringify(rateLimitMessage(limited(3412)))).not.toMatch(/\d+s\b|second/);
  });

  // Without the wait it can still say it in plain words, rather than fall back
  // to "too many requests".
  it('says a few minutes when the wait is missing or not a number', () => {
    const fewMinutes = {
      message: 'Too many tries just now.',
      suggestion: 'Try again in a few minutes.',
    };
    expect(rateLimitMessage({ code: 'rate_limited' })).toStrictEqual(fewMinutes);
    expect(rateLimitMessage(limited('60'))).toStrictEqual(fewMinutes);
    expect(rateLimitMessage(limited(Number.NaN))).toStrictEqual(fewMinutes);
    expect(rateLimitMessage(limited(Number.POSITIVE_INFINITY))).toStrictEqual(fewMinutes);
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(rateLimitMessage({ code: 'conflict' })).toBeNull();
    expect(rateLimitMessage({ code: 'closed', details: { retryAfterSeconds: 60 } })).toBeNull();
    expect(rateLimitMessage({})).toBeNull();
    expect(rateLimitMessage(null)).toBeNull();
    expect(rateLimitMessage(undefined)).toBeNull();
  });
});
