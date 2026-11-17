import type { ErrorCode } from '../errors';

/** A code added to `ErrorCode` fails the type check here until it's listed. */
const EVERY_CODE = {
  not_found: true,
  conflict: true,
  capacity_full: true,
  closed: true,
  forbidden: true,
  unauthorized: true,
  invalid_input: true,
  rate_limited: true,
  already_consumed: true,
  internal: true,
} satisfies Record<ErrorCode, true>;

/** Every `ErrorCode`, for a test that goes through them all. */
export const ERROR_CODES = Object.keys(EVERY_CODE) as ErrorCode[];
