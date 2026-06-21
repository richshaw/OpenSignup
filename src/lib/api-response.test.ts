import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { ServiceException, serviceError } from './errors';
import { fail, handle, respond } from './api-response';
import { err } from './result';

describe('fail()', () => {
  it('sets Retry-After for rate_limited errors returned via respond()', () => {
    const res = respond(
      err(serviceError('rate_limited', 'slow down', { details: { retryAfterSeconds: 7 } })),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('7');
  });

  it('lets an explicit Retry-After header win over the derived one', () => {
    const res = fail(
      serviceError('rate_limited', 'slow down', { details: { retryAfterSeconds: 7 } }),
      { 'Retry-After': '99' },
    );
    expect(res.headers.get('Retry-After')).toBe('99');
  });
});

describe('handle()', () => {
  it('sets Retry-After header when rate_limited with retryAfterSeconds', async () => {
    const res = await handle(() => {
      throw new ServiceException(
        serviceError('rate_limited', 'too many requests', {
          details: { retryAfterSeconds: 10 },
        }),
      );
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('10');
  });

  it('does not set Retry-After for non-rate-limit errors', async () => {
    const res = await handle(() => {
      throw new ServiceException(serviceError('not_found', 'missing'));
    });
    expect(res.status).toBe(404);
    expect(res.headers.get('Retry-After')).toBeNull();
  });

  it('does not set Retry-After when retryAfterSeconds is absent', async () => {
    const res = await handle(() => {
      throw new ServiceException(serviceError('rate_limited', 'too many requests'));
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeNull();
  });

  it('returns 400 for a ZodError', async () => {
    const res = await handle(() => {
      throw new ZodError([
        {
          code: 'too_small',
          minimum: 1,
          type: 'string',
          inclusive: true,
          message: 'too short',
          path: ['name'],
        },
      ]);
    });
    expect(res.status).toBe(400);
    expect(res.headers.get('Retry-After')).toBeNull();
  });

  it('returns 500 for unknown errors', async () => {
    const res = await handle(() => {
      throw new Error('boom');
    });
    expect(res.status).toBe(500);
  });
});
