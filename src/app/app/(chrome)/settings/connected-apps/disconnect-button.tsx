'use client';

import { AsyncSubmitButton } from '@/components/ui/async-submit-button';

export function DisconnectButton() {
  return (
    <AsyncSubmitButton
      loadingLabel="Disconnecting…"
      className="rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10 disabled:opacity-60"
    >
      Disconnect
    </AsyncSubmitButton>
  );
}
