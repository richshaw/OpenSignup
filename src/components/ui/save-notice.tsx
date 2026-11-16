import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/**
 * "Saved", next to whatever saved it: the Build tab's status and the Settings
 * tab's form. It has no hooks, so a server page can show it without adding
 * script. Pass `role="status"` where it appears after a save on its own, and
 * `children` for a longer line in the same style, such as account Settings'
 * "Saved. Your 3 open signups now use Svenska."
 */
export function SavedNotice({
  role,
  children = 'Saved',
}: {
  role?: 'status';
  children?: ReactNode;
}) {
  return (
    <span
      role={role}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-success"
    >
      <Check size={11} />
      {/* One flex item, so a longer line's words and parts keep their own spacing. */}
      <span>{children}</span>
    </span>
  );
}
