import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

/**
 * A save's confirmation, next to whatever saved it: the Build tab's status,
 * the Settings tab's forms and account Settings' language. It has no hooks,
 * so a server page can show it without adding script. Its text is the
 * caller's, in the organizer's language: "Saved" (`organizer.saveNotice`),
 * or a longer line in the same style, such as account Settings' "Saved. Your
 * 3 open signups now use Svenska." Pass `role="status"` where it appears
 * after a save on its own.
 */
export function SavedNotice({ role, children }: { role?: 'status'; children: ReactNode }) {
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
