'use client';

import { useId, type Ref } from 'react';

/** What the share panel says when the clipboard refuses the link. */
export const LINK_COPY_REFUSED = 'Couldn’t copy. Select the link and copy it.';

/**
 * The public link in a read-only box, selected whole when it gets focus, so
 * it can be copied by hand where the clipboard refuses. The share panel and
 * its fallback both show it.
 */
export function ShareLinkField({ url, ref }: { url: string; ref?: Ref<HTMLInputElement> }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="sr-only">
        Public link
      </label>
      <input
        ref={ref}
        id={id}
        type="text"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 min-w-0 flex-1 rounded-[10px] border border-surface-sunk bg-surface-raised px-3 font-mono text-[12.5px] text-ink"
      />
    </>
  );
}
