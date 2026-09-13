'use client';

import { AsyncSubmitButton } from '@/components/ui/async-submit-button';

/**
 * Two plain HTML forms posting to the decision route. Deny is as easy to hit
 * as approve — same size, same row — and both are real submits so the
 * provider's interaction cookie (scoped to this path) travels with them.
 */
export function ConsentForm({ action }: { action: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <form action={action} method="post" className="flex-1">
        <input type="hidden" name="decision" value="approve" />
        <AsyncSubmitButton
          loadingLabel="Connecting…"
          className="w-full rounded-lg bg-brand px-5 py-3 font-medium text-white transition-colors hover:bg-[#1658c4] disabled:opacity-60"
        >
          Allow
        </AsyncSubmitButton>
      </form>
      <form action={action} method="post" className="flex-1">
        <input type="hidden" name="decision" value="deny" />
        <AsyncSubmitButton
          loadingLabel="Declining…"
          className="w-full rounded-lg border border-surface-sunk bg-white px-5 py-3 font-medium text-ink transition-colors hover:bg-surface-raised disabled:opacity-60"
        >
          Don&apos;t allow
        </AsyncSubmitButton>
      </form>
    </div>
  );
}
