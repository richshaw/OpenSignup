import { describe, expect, it } from 'vitest';
import { mapMagicComposeError } from '@/app/api/signups/magic-compose/errors';
import { MAGIC_COMPOSE_BUCKET } from '@/lib/magic-compose/limits';
import type { MagicComposeError } from '@/lib/magic-compose/llm-client';
import type { FollowUp } from '@/lib/magic-compose/questions';
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

  it('gives a rate limit that is neither the line for its code', () => {
    const error = {
      code: 'rate_limited',
      message: 'too many requests',
      details: { bucket: 'signup.create', retryAfterSeconds: 60 },
    };
    expect(explainDraftFailure(429, error)).toEqual({
      kind: 'message',
      text: 'Slow down — try again in a moment.',
    });
  });

  // The route's answer for each failure of the AI provider, as it builds it.
  const failure = (llm: MagicComposeError) => {
    const mapped = mapMagicComposeError(llm);
    return {
      code: mapped.code,
      message: mapped.message,
      details: {
        llmErrorCode: llm.code,
        ...mapped.details,
        ...(llm.status !== undefined ? { upstreamStatus: llm.status } : {}),
      },
    };
  };
  const PROVIDER: MagicComposeError[] = [
    { code: 'timeout', message: 'x' },
    { code: 'upstream', message: 'x', status: 401 },
    { code: 'upstream', message: 'x', status: 403 },
    { code: 'upstream', message: 'x', status: 503 },
    { code: 'upstream', message: 'x', status: 400 },
    { code: 'upstream', message: 'x' },
    { code: 'invalid_json', message: 'x' },
    { code: 'schema_mismatch', message: 'x' },
  ];

  it.each(PROVIDER)(
    'words the provider failure $code $status as the route did, never with its message',
    (llm) => {
      const sent = failure(llm);
      const text = sent.message;
      expect(explainDraftFailure(500, sent)).toEqual({ kind: 'message', text });
      expect(explainDraftFailure(500, { ...sent, message: 'Server words' })).toEqual({
        kind: 'message',
        text,
      });
    },
  );

  it('says a draft of the wrong shape as it did, never with the message or suggestion', () => {
    const text = 'AI draft did not match expected shape — try again or adjust your prompt';
    const sent = {
      code: 'internal',
      message: 'AI draft did not match expected shape',
      suggestion: 'try again or adjust your prompt',
      details: { reason: 'draft_invalid', issues: [] },
    };
    expect(explainDraftFailure(500, sent)).toEqual({ kind: 'message', text });
    expect(
      explainDraftFailure(500, { ...sent, message: 'Server words', suggestion: 'more' }),
    ).toEqual({ kind: 'message', text });
  });

  const nothing: FollowUp = { what: { picked: [], added: [] }, when: { kind: 'not_decided' } };
  const answered: FollowUp = { what: { picked: ['Bake something'], added: [] } };
  const askedAgain = {
    code: 'invalid_input',
    message: 'Server words',
    details: { reason: 'asked_again' },
  };

  it('says what the route said when the AI asked again, by the answers sent', () => {
    expect(explainDraftFailure(400, askedAgain, { followUp: nothing })).toEqual({
      kind: 'message',
      text: "Couldn't draft this. Try again, or fill it in by hand.",
    });
    expect(explainDraftFailure(400, askedAgain, { followUp: answered })).toEqual({
      kind: 'message',
      text: "Couldn't draft from these answers. Add a little more, or fill it in by hand.",
    });
  });

  it("shows the AI's own reason when it declines", () => {
    const declined = {
      code: 'invalid_input',
      message: 'This asks for home addresses, which a signup should not collect.',
      details: { reason: 'refusal' },
    };
    expect(explainDraftFailure(400, declined)).toEqual({
      kind: 'message',
      text: 'This asks for home addresses, which a signup should not collect.',
    });
  });

  it('gives any other refusal the line for its code, never its message', () => {
    expect(
      explainDraftFailure(403, {
        code: 'forbidden',
        message: 'your role cannot modify this workspace',
      }),
    ).toEqual({ kind: 'message', text: 'You don’t have edit access.' });
    expect(
      explainDraftFailure(500, {
        code: 'internal',
        message: 'something went wrong',
        suggestion: 'try again',
      }),
    ).toEqual({ kind: 'message', text: 'Save failed.' });
    expect(
      explainDraftFailure(400, {
        code: 'invalid_input',
        message: 'Keep the description to 10,000 characters or fewer.',
      }),
    ).toEqual({ kind: 'message', text: 'Some values weren’t accepted.' });
  });

  it('says only to try again when a call with answers times out', () => {
    const timeout = failure({ code: 'timeout', message: 'x' });
    expect(explainDraftFailure(500, timeout, { followUp: answered })).toEqual({
      kind: 'message',
      text: 'AI drafting timed out. Try again.',
    });
    const unavailable = failure({ code: 'upstream', message: 'x', status: 503 });
    expect(explainDraftFailure(500, unavailable, { followUp: answered })).toEqual({
      kind: 'message',
      text: 'AI provider is unavailable right now (HTTP 503). Try again.',
    });
  });

  it('falls back to the status when there is no error body, or no code it knows', () => {
    expect(explainDraftFailure(502, undefined)).toEqual({
      kind: 'message',
      text: 'AI drafting failed (HTTP 502). Try again.',
    });
    expect(explainDraftFailure(502, { code: 'bad_gateway', message: 'Server words' })).toEqual({
      kind: 'message',
      text: 'AI drafting failed (HTTP 502). Try again.',
    });
  });
});
