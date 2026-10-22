import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { err, ok } from './result';
import {
  fromZodError,
  httpStatusFor,
  refusalAsResult,
  serviceError,
  ServiceException,
} from './errors';

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
    const parsed = schema.safeParse({ name: 123, count: -1 });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const err = fromZodError(parsed.error);
    expect(err.code).toBe('invalid_input');
    expect(err.field).toBe('name');
    expect(err.expected).toBe('string');
    expect(err.received).toBe('number');
    expect(err.suggestion).toBeDefined();
    expect(err.details).toBeUndefined();
  });
});

describe('refusalAsResult', () => {
  it('passes a returned result through', async () => {
    expect(await refusalAsResult(async () => ok(1))).toEqual(ok(1));
    const refused = serviceError('conflict', 'taken');
    expect(await refusalAsResult(async () => err(refused))).toEqual(err(refused));
  });

  it('turns a thrown ServiceException into an error result', async () => {
    const forbidden = serviceError('forbidden', 'your role cannot modify this workspace');
    const result = await refusalAsResult(async () => {
      throw new ServiceException(forbidden);
    });
    expect(result).toEqual(err(forbidden));
  });

  it('lets any other throw through', async () => {
    const boom = new Error('boom');
    await expect(
      refusalAsResult(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});
