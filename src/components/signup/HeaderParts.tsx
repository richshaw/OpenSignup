// Parts of the signup header that never change on the page, rendered by
// `SignupHeader` on the server. The phone's header is a client component, so
// it takes these as nodes rather than rendering them, which keeps them out of
// every signup tab's JavaScript.
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import type { SignupStatus } from '@/schemas/signups';
import { SHEET_ITEM } from './header-buttons';

/**
 * Under a draft's title, on a computer and a phone, in place of the public
 * link: the link only says the signup isn't ready yet, so there's nothing
 * to send until it's published.
 */
export function DraftLine() {
  return (
    <p className="text-[13px] text-ink-muted">Only you can see this draft until you publish it.</p>
  );
}

/**
 * Under the title on a phone: a draft's line, or the public link with a
 * closed or archived signup's count under it. An open signup's count is in
 * the bar at the bottom, beside Share.
 */
export function PhoneStanding({
  signupId,
  status,
  publicUrl,
  spotsTaken,
}: {
  /** For the chip, which records a copy against the signup. */
  signupId: string;
  status: SignupStatus;
  publicUrl: string;
  /** From `spotsTakenLine`; null for a draft. */
  spotsTaken: string | null;
}) {
  if (status === 'draft') return <DraftLine />;
  return (
    <div className="flex flex-col gap-1.5">
      <PublicLinkChip url={publicUrl} signupId={signupId} />
      {status !== 'open' && spotsTaken ? (
        <p className="text-[13px] text-ink-muted">{spotsTaken}</p>
      ) : null}
    </div>
  );
}

/** Preview in a phone's More actions sheet: a new tab, as on a computer. */
export function PhonePreviewItem({ href }: { href: string }) {
  return (
    <Link href={href} target="_blank" rel="noreferrer" className={SHEET_ITEM}>
      <Eye size={16} aria-hidden="true" />
      <span>Preview</span>
    </Link>
  );
}
