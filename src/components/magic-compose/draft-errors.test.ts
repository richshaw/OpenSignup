import { describe, expect, it } from 'vitest';
import { MAGIC_COMPOSE_BUCKET } from '@/lib/magic-compose/limits';
import { RateLimits } from '@/lib/rate-limit';
import { explainDraftFailure } from './draft-errors';

const hourly = (retryAfterSeconds?: number) => ({
  code: 'rate_limited',
  message: 'too many requests',
  suggestion: `wait ${retryAfterSeconds}s and retry`,
  details: {
    bucket: MAGIC_COMPOSE_BUCKET,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  },
});

describe('explainDraftFailure', () => {
  it('knows the bucket the route charges by name', () => {
    expect(RateLimits.magicComposePerOrganizer.bucket).toBe(MAGIC_COMPOSE_BUCKET);
  });

  it('turns the hourly limit into whole minutes, rounded up', () => {
    expect(explainDraftFailure(429, hourly(700))).toEqual({ kind: 'hourly_limit', minutes: 12 });
    expect(explainDraftFailure(429, hourly(60))).toEqual({ kind: 'hourly_limit', minutes: 1 });
    expect(explainDraftFailure(429, hourly(1))).toEqual({ kind: 'hourly_limit', minutes: 1 });
  });

  it('assumes the whole window when the wait is missing', () => {
    expect(explainDraftFailure(429, hourly())).toEqual({ kind: 'hourly_limit', minutes: 60 });
  });

  const provider = (retryAfterSeconds?: number) => ({
    code: 'rate_limited',
    message: 'AI provider is rate limiting requests. Try again shortly.',
    details: {
      llmErrorCode: 'rate_limited',
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
  });

  it("words the provider's own 429 as a busy service", () => {
    const busy = 'The AI service is busy. Try again in a minute.';
    expect(explainDraftFailure(429, provider(30))).toEqual({ kind: 'message', text: busy });
    expect(explainDraftFailure(429, provider())).toEqual({ kind: 'message', text: busy });
  });

  it('says how long the provider asked for, when that is more than a minute', () => {
    expect(explainDraftFailure(429, provider(600))).toEqual({
      kind: 'message',
      text: 'The AI service is busy. Try again in 10 minutes.',
    });
  });

  it('keeps the server message for a rate limit that is neither', () => {
    const error = {
      code: 'rate_limited',
      message: 'too many requests',
      details: { bucket: 'signup.create', retryAfterSeconds: 60 },
    };
    expect(explainDraftFailure(429, error)).toEqual({ kind: 'message', text: 'too many requests' });
  });

  it('keeps the server message and its suggestion for other errors', () => {
    const error = {
      code: 'internal',
      message: 'AI draft did not match expected shape',
      suggestion: 'try again or adjust your prompt',
    };
    expect(explainDraftFailure(500, error)).toEqual({
      kind: 'message',
      text: 'AI draft did not match expected shape — try again or adjust your prompt',
    });
  });

  it('falls back to the status when there is no error body', () => {
    expect(explainDraftFailure(502, undefined)).toEqual({
      kind: 'message',
      text: 'AI drafting failed (HTTP 502). Try again.',
    });
  });
});
