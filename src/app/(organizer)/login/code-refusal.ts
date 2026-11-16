import type { ServiceError } from '@/lib/errors';
import type { CodeErrorReason } from './login-form';

/**
 * The code form's reason for a code `redeemLoginCode` refused, from the
 * refusal's `details.reason`, which the form words in the sign-in pages'
 * language. A code that isn't six digits (`code_malformed`) and one that
 * matches nothing live (`code_invalid`) both read as a wrong code, as they
 * did before the catalog. A refusal without a reason it knows falls back on
 * its code, as before: `already_consumed` is an expired code, and anything
 * else (the stored link couldn't be read back) a wrong one.
 */
export function codeRefusal(error: ServiceError): CodeErrorReason {
  switch (error.details?.reason) {
    case 'code_expired':
      return 'expired';
    case 'code_malformed':
    case 'code_invalid':
      return 'wrong';
    default:
      return error.code === 'already_consumed' ? 'expired' : 'wrong';
  }
}
