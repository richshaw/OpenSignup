import type { ErrorCode } from '@/lib/errors';

/**
 * What an organizer reads when Remove is refused, by the error's code, in
 * place of the service's message, which is written for developers ("commitment
 * not found", "your role cannot modify this workspace"). `not_found` means the
 * sign-up is gone: its slot or the signup was deleted since the page loaded. A
 * sign-up already cancelled is not refused, since removing it changes nothing.
 */
export function removeRefusal(code: ErrorCode): string {
  switch (code) {
    case 'not_found':
      return 'This person is no longer on this signup. Reload to see the latest.';
    case 'forbidden':
      return 'You don’t have edit access.';
    default:
      return 'Couldn’t remove them. Try again.';
  }
}
