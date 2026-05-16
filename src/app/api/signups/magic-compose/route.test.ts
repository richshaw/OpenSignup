import { describe, expect, it } from 'vitest';
import type { MagicComposeError, MagicComposeErrorCode } from '@/lib/magic-compose/llm-client';
import { mapMagicComposeError } from './errors';

const CASES: Array<{ code: MagicComposeErrorCode; expectedHttp: number; expectedCode: string }> = [
  { code: 'not_configured', expectedHttp: 403, expectedCode: 'forbidden' },
  { code: 'rate_limited', expectedHttp: 429, expectedCode: 'rate_limited' },
  { code: 'aborted', expectedHttp: 500, expectedCode: 'internal' },
  { code: 'timeout', expectedHttp: 500, expectedCode: 'internal' },
  { code: 'upstream', expectedHttp: 500, expectedCode: 'internal' },
  { code: 'invalid_json', expectedHttp: 500, expectedCode: 'internal' },
  { code: 'schema_mismatch', expectedHttp: 500, expectedCode: 'internal' },
];

describe('mapMagicComposeError', () => {
  it.each(CASES)('maps $code → ServiceError code $expectedCode', ({ code, expectedCode }) => {
    const error: MagicComposeError = { code, message: 'x' };
    const mapped = mapMagicComposeError(error);
    expect(mapped.code).toBe(expectedCode);
    expect(mapped.message).toEqual(expect.any(String));
    expect(mapped.message.length).toBeGreaterThan(0);
  });

  it('aborted is classified as internal, not invalid_input', () => {
    // Regression: previously aborted mapped to invalid_input/400, misclassifying
    // client-cancelled requests as user input errors in Sentry.
    const mapped = mapMagicComposeError({ code: 'aborted', message: 'cancelled' });
    expect(mapped.code).not.toBe('invalid_input');
    expect(mapped.code).toBe('internal');
  });

  it('timeout hints at LLM_TIMEOUT_MS', () => {
    const mapped = mapMagicComposeError({ code: 'timeout', message: 'x' });
    expect(mapped.message).toMatch(/LLM_TIMEOUT_MS/);
  });
});
