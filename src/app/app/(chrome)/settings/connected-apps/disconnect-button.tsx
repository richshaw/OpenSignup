'use client';

import { AsyncSubmitButton } from '@/components/ui/async-submit-button';

/**
 * A connected app's Disconnect button, which says it's working while the
 * disconnect runs. Its two labels come from the page, in the organizer's
 * language, so the page sends no messages to the browser for two words.
 */
export function DisconnectButton({
  label,
  loadingLabel,
}: {
  /** "Disconnect". */
  label: string;
  /** "Disconnecting…", while it runs. */
  loadingLabel: string;
}) {
  return (
    <AsyncSubmitButton
      loadingLabel={loadingLabel}
      className="rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
    >
      {label}
    </AsyncSubmitButton>
  );
}
