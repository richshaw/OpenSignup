import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from 'next-auth';
import { log } from '@/lib/log';
import { authLogger } from './logger';

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
  error = vi.spyOn(log, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Auth.js's own error classes, which next-auth doesn't re-export: a subclass
// takes its `type` from the static one, as theirs do.
class Verification extends AuthError {
  static type = 'Verification';
}
class CallbackRouteError extends AuthError {
  static type = 'CallbackRouteError';
}

describe('authLogger', () => {
  it('logs a used, expired or unknown sign-in token as one warning, without a stack', () => {
    authLogger.error(new Verification());

    expect(error).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('auth: sign-in link was already used, expired or unknown');
  });

  it('passes every other Auth.js error to the error log with its cause', () => {
    const failure = new CallbackRouteError('adapter down', {
      cause: new Error('connection refused'),
    });
    authLogger.error(failure);

    expect(warn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith({ err: failure, type: 'CallbackRouteError' }, 'auth: error');
  });

  it('passes a plain error to the error log', () => {
    const failure = new Error('boom');
    authLogger.error(failure);

    expect(error).toHaveBeenCalledWith({ err: failure, type: 'Error' }, 'auth: error');
  });
});
