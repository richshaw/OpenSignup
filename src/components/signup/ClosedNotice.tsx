'use client';

import { useState } from 'react';
import { Banner } from '@/components/banner';
import type { SignupStatus } from '@/schemas/signups';
import type { SignupHeaderText } from './header-text';
import { focusTitle, useLastStatusChange } from './HeaderAnnouncer';

/**
 * The grey Signup closed box, once: under the header right after Close
 * signup on this page has closed the signup, on every tab, until its ✕ or
 * the page is next loaded. A signup that's closed when the page loads, or is
 * closed some other way (another tab, an AI assistant), shows none: the
 * header says it's closed every time, with its status, "Closed ·" by the
 * link, and Reopen signup. Closing it again after a reopen shows it again.
 *
 * After its text, a link to `help`, the help page on closing and reopening,
 * in the same tab.
 *
 * Not a live region: the header's says it closed. Its ✕ takes the focus
 * with it, so focus goes to the signup's title rather than to the page.
 */
export function ClosedNotice({
  status,
  text,
  help,
}: {
  status: SignupStatus;
  /** Its words, from the server. */
  text: SignupHeaderText['closedNotice'];
  /** The help page's address, from the server, which keeps it out of the page's JavaScript. */
  help: string;
}) {
  const changed = useLastStatusChange();
  const [dismissed, setDismissed] = useState<number | null>(null);
  if (status !== 'closed' || !changed?.here || changed.to !== 'closed' || dismissed === changed.n)
    return null;
  return (
    <Banner
      kind="closed"
      live={false}
      title={text.title}
      body={text.body}
      link={{ href: help, label: text.help }}
      onDismiss={() => {
        setDismissed(changed.n);
        focusTitle();
      }}
      dismissLabel={text.dismiss}
    />
  );
}
