// Parts of the signup header that never change on the page, rendered by
// `SignupHeader` on the server. The phone's header is a client component, so
// it takes these as nodes rather than rendering them, which keeps them out of
// every signup tab's JavaScript.
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { PublicLinkChip } from '@/components/PublicLinkChip';
import type { PublicLinkChipText } from '@/components/share/share-text';
import type { SignupStatus } from '@/schemas/signups';
import { SHEET_ITEM } from './header-buttons';

/** A draft's two sentences under its title. */
export interface DraftLineText {
  /** `organizer.signup.draftLine`: who can see it. */
  onlyYou: string;
  /**
   * `organizer.signup.draftHowPeopleSignUp`: where names go, since the Build
   * tab looks like the page people sign up on but takes no names itself.
   */
  howPeopleSignUp: string;
}

/**
 * Under a draft's title, on a computer and a phone, in place of the public
 * link: the link only says the signup isn't ready yet, so there's nothing
 * to send until it's published. Each sentence is its own element.
 */
export function DraftLine({ text }: { text: DraftLineText }) {
  return (
    <div className="space-y-0.5 text-[13px] text-ink-muted">
      <p>{text.onlyYou}</p>
      <p>{text.howPeopleSignUp}</p>
    </div>
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
  chip,
  spotsTaken,
  draftLine,
}: {
  /** For the chip, which records a copy against the signup. */
  signupId: string;
  status: SignupStatus;
  publicUrl: string;
  /** The chip's words. */
  chip: PublicLinkChipText;
  /** From `spotsTakenLine`; null for a draft. */
  spotsTaken: string | null;
  /** `DraftLine`'s text. */
  draftLine: DraftLineText;
}) {
  if (status === 'draft') return <DraftLine text={draftLine} />;
  return (
    <div className="flex flex-col gap-1.5">
      <PublicLinkChip url={publicUrl} text={chip} signupId={signupId} />
      {status !== 'open' && spotsTaken ? (
        <p className="text-[13px] text-ink-muted">{spotsTaken}</p>
      ) : null}
    </div>
  );
}

/** Preview in a phone's More actions sheet: a new tab, as on a computer. */
export function PhonePreviewItem({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} target="_blank" rel="noreferrer" className={SHEET_ITEM}>
      <Eye size={16} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
