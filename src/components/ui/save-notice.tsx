import { Check } from 'lucide-react';
import type { ErrorCode } from '@/lib/errors';

/**
 * What an organizer reads when a save is refused, by error code. The service's
 * own message is written for developers ("your role cannot modify this
 * workspace"), so the Build tab and the Settings tab both show these instead.
 */
export const SAVE_ERROR_MESSAGE: Record<ErrorCode, string> = {
  forbidden: 'You no longer have edit access.',
  unauthorized: 'Sign in again to save.',
  conflict: 'Reload to see the latest changes.',
  capacity_full: 'Slot is full.',
  closed: 'Sign-up is closed.',
  not_found: 'No longer available.',
  invalid_input: 'Some values weren’t accepted.',
  rate_limited: 'Slow down — try again in a moment.',
  already_consumed: 'Already used.',
  internal: 'Save failed.',
};

/**
 * "Saved", next to whatever saved it: the Build tab's status and the Settings
 * tab's form. It has no hooks, so a server page can show it without adding
 * script. Pass `role="status"` where it appears after a save on its own.
 */
export function SavedNotice({ role }: { role?: 'status' }) {
  return (
    <span
      role={role}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-success"
    >
      <Check size={11} />
      Saved
    </span>
  );
}
