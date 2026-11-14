import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorEnvelope } from './api-response';
import { err, ok } from './result';
import {
  fromZodError,
  httpStatusFor,
  INTERNAL_ERROR,
  refusalAsResult,
  serviceError,
  serviceErrorFromThrown,
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

  describe('with a table of reasons', () => {
    const reasons = {
      name: { too_small: 'name_required', too_big: 'name_too_long' },
      count: { invalid_type: 'quantity_not_whole' },
    } as const;

    function issueOf(input: unknown) {
      const parsed = schema.safeParse(input);
      if (parsed.success) throw new Error('expected a parse failure');
      return parsed.error;
    }

    it('gives the reason the table names for the first issue, by its field and code', () => {
      expect(fromZodError(issueOf({ name: 'a', count: 1 }), reasons).details).toEqual({
        reason: 'name_required',
      });
      expect(fromZodError(issueOf({ name: 'ab', count: 1.5 }), reasons).details).toEqual({
        reason: 'quantity_not_whole',
      });
      // Both fields wrong: the reason is the first issue's, as `field` is.
      const both = fromZodError(issueOf({ name: 'a', count: 1.5 }), reasons);
      expect(both.field).toBe('name');
      expect(both.details).toEqual({ reason: 'name_required' });
    });

    it('gives none for an issue the table does not name', () => {
      // `name` lists too_small and too_big, not invalid_type; `count` lists no too_small.
      expect(fromZodError(issueOf({ name: 123, count: 1 }), reasons).details).toBeUndefined();
      expect(fromZodError(issueOf({ name: 'ab', count: -1 }), reasons).details).toBeUndefined();
      // An issue on the whole input has no field to look up.
      expect(fromZodError(issueOf('not an object'), reasons).details).toBeUndefined();
    });

    it('leaves every other field as it was, in the same order, adding details last', () => {
      for (const input of [
        { name: 'a', count: 1 },
        { name: 'ab', count: 1.5 },
      ]) {
        const error = issueOf(input);
        const without = fromZodError(error);
        const withReason = fromZodError(error, reasons);
        const { details, ...rest } = withReason;
        expect(rest).toEqual(without);
        // The bytes an API caller gets: the same, with `details` added at the end.
        const before = JSON.stringify(errorEnvelope(without));
        expect(JSON.stringify(errorEnvelope(withReason))).toBe(
          `${before.slice(0, -2)},"details":${JSON.stringify(details)}}}`,
        );
      }
    });
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

describe('serviceErrorFromThrown', () => {
  it('turns a ZodError into the same invalid_input fromZodError gives', () => {
    const parsed = z.object({ title: z.string() }).safeParse({ title: 1 });
    if (parsed.success) throw new Error('expected a parse failure');
    expect(serviceErrorFromThrown(parsed.error)).toEqual(fromZodError(parsed.error));
    expect(serviceErrorFromThrown(parsed.error)?.code).toBe('invalid_input');
  });

  it("returns a ServiceException's own error", () => {
    const se = serviceError('forbidden', 'read-only');
    expect(serviceErrorFromThrown(new ServiceException(se))).toBe(se);
  });

  it('returns null for anything else, so the caller logs it and answers INTERNAL_ERROR', () => {
    expect(serviceErrorFromThrown(new Error('db down'))).toBeNull();
    expect(serviceErrorFromThrown('a string')).toBeNull();
    expect(serviceErrorFromThrown(undefined)).toBeNull();
    expect(INTERNAL_ERROR).toEqual({ code: 'internal', message: 'something went wrong' });
  });
});
