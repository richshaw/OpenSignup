import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fromZodError, httpStatusFor, serviceError } from './errors';

describe('serviceError', () => {
  it('includes code and message', () => {
    const e = serviceError('not_found', 'signup not found');
    expect(e.code).toBe('not_found');
    expect(e.message).toBe('signup not found');
  });

  it('passes through extras', () => {
    const e = serviceError('capacity_full', 'full', {
      details: { alternatives: ['slot_a', 'slot_b'] },
    });
    expect(e.details?.alternatives).toEqual(['slot_a', 'slot_b']);
  });
});

describe('httpStatusFor', () => {
  it('maps codes to HTTP status', () => {
    expect(httpStatusFor('not_found')).toBe(404);
    expect(httpStatusFor('capacity_full')).toBe(409);
    expect(httpStatusFor('forbidden')).toBe(403);
    expect(httpStatusFor('rate_limited')).toBe(429);
  });
});

describe('fromZodError', () => {
  const schema = z.object({
    name: z.string().min(2),
    count: z.number().int().nonnegative(),
  });

  it('builds LLM-friendly error with field/received/expected/suggestion', () => {
    const parsed = schema.safeParse({ name: 'x', count: -1 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const err = fromZodError(parsed.error);
    expect(err.code).toBe('invalid_input');
    expect(err.field).toBe('name');
    expect(err.suggestion).toBeDefined();
  });
});
