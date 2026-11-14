import { describe, expect, it } from 'vitest';
import { getStandInTranslator, getTestTranslator } from '@/i18n/testing/translator';
import { rateLimitMessage } from './rate-limit-message';

const t = getTestTranslator('participant.errors');

const limited = (retryAfterSeconds: unknown) => ({
  code: 'rate_limited',
  details: { retryAfterSeconds, bucket: 'commit.ip' },
});

describe('rateLimitMessage', () => {
  it('says how many minutes to wait, rounded up', () => {
    expect(rateLimitMessage(limited(3412), t)).toStrictEqual({
      message: 'Too many tries just now.',
      suggestion: 'Try again in about 57 minutes.',
    });
    expect(rateLimitMessage(limited(61), t)?.suggestion).toBe('Try again in about 2 minutes.');
    expect(rateLimitMessage(limited(120), t)?.suggestion).toBe('Try again in about 2 minutes.');
  });

  it('says one minute, never less, for a short wait', () => {
    expect(rateLimitMessage(limited(60), t)?.suggestion).toBe('Try again in about 1 minute.');
    expect(rateLimitMessage(limited(5), t)?.suggestion).toBe('Try again in about 1 minute.');
    expect(rateLimitMessage(limited(0), t)?.suggestion).toBe('Try again in about 1 minute.');
  });

  // `${minutes}` printed no separator, and the catalog's count keeps it that way.
  it('prints a long wait without a separator, as before', () => {
    expect(rateLimitMessage(limited(1234 * 60), t)?.suggestion).toBe(
      'Try again in about 1234 minutes.',
    );
  });

  // The helper never sends 0 (it rounds up to 1), but a translation reads the
  // whole plural, so English reads right at every count.
  it.each([
    [0, 'Try again in about 0 minutes.'],
    [1, 'Try again in about 1 minute.'],
    [2, 'Try again in about 2 minutes.'],
  ])('words a wait of %i minute(s) in the catalog as a whole sentence', (minutes, text) => {
    expect(t('rateLimit.wait', { minutes })).toBe(text);
  });

  it('never shows seconds', () => {
    expect(JSON.stringify(rateLimitMessage(limited(3412), t))).not.toMatch(/\d+s\b|second/);
  });

  // Without the wait it can still say it in plain words, rather than fall back
  // to "too many requests".
  it('says a few minutes when the wait is missing or not a number', () => {
    const fewMinutes = {
      message: 'Too many tries just now.',
      suggestion: 'Try again in a few minutes.',
    };
    expect(rateLimitMessage({ code: 'rate_limited' }, t)).toStrictEqual(fewMinutes);
    expect(rateLimitMessage(limited('60'), t)).toStrictEqual(fewMinutes);
    expect(rateLimitMessage(limited(Number.NaN), t)).toStrictEqual(fewMinutes);
    expect(rateLimitMessage(limited(Number.POSITIVE_INFINITY), t)).toStrictEqual(fewMinutes);
  });

  it('takes its lines from the translator it is given', () => {
    const sv = getStandInTranslator('sv', 'participant.errors');
    expect(rateLimitMessage(limited(3412), sv)).toStrictEqual({
      message: 'participant.errors.rateLimit.message in sv',
      suggestion: 'participant.errors.rateLimit.wait in sv',
    });
    expect(rateLimitMessage({ code: 'rate_limited' }, sv)?.suggestion).toBe(
      'participant.errors.rateLimit.waitAWhile in sv',
    );
  });

  it('leaves every other error, and none, to the caller', () => {
    expect(rateLimitMessage({ code: 'conflict' }, t)).toBeNull();
    expect(rateLimitMessage({ code: 'closed', details: { retryAfterSeconds: 60 } }, t)).toBeNull();
    expect(rateLimitMessage({}, t)).toBeNull();
    expect(rateLimitMessage(null, t)).toBeNull();
    expect(rateLimitMessage(undefined, t)).toBeNull();
  });
});
