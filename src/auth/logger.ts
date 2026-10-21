import { AuthError, type NextAuthConfig } from 'next-auth';
import { log } from '@/lib/log';

/**
 * Auth.js's `error` logger, sent through pino so `redact` applies.
 *
 * A sign-in link clicked twice is normal: the first click uses the single-use
 * token, and the second gets `Verification` and a redirect to /login. Auth.js
 * would print that with a full stack trace, so it becomes one warning here.
 * `Verification` also covers an expired or unknown token, which Auth.js
 * doesn't tell apart in the error it hands over, so the warning names all
 * three. Every other error goes to `log.error` with its cause.
 *
 * Only `error` is replaced: Auth.js keeps its own `warn`, and its `debug`
 * stays off unless `debug` is set.
 */
export const authLogger = {
  error(error: Error) {
    const type = error instanceof AuthError ? error.type : error.name;
    if (type === 'Verification') {
      log.warn('auth: sign-in link was already used, expired or unknown');
      return;
    }
    log.error({ err: error, type }, 'auth: error');
  },
} satisfies NextAuthConfig['logger'];
