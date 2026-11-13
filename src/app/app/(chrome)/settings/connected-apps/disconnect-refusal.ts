import type { ErrorCode } from '@/lib/errors';

/**
 * What an organizer reads when Disconnect fails, by the error's code, in
 * place of the service's message, which is written for developers ("no such
 * connected app"). `not_found` means the app was disconnected already, from
 * another tab say, since the page loaded. No code means an unexpected error.
 */
export function disconnectRefusal(code: ErrorCode | undefined): string {
  switch (code) {
    case 'not_found':
      return 'That app is already disconnected.';
    default:
      return 'Couldn’t disconnect. Try again.';
  }
}
