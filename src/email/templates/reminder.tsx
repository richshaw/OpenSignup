import { Button, Heading, Link, Text } from '@react-email/components';
import { reminderSubject } from '../subjects';
import type { SlotDetail } from '@/lib/slot-label';
import { EmailLayout } from './layout';
import { SlotDetailsText } from './slot-details';

export interface ReminderEmailProps {
  participantName: string;
  signupTitle: string;
  signupUrl: string;
  /**
   * The participant's own token-bearing link. Preferred over signupUrl because
   * participants have no account to sign in to — this is the only way they can
   * reach their commitment from a device that has lost the returning-participant
   * cookie.
   */
  manageUrl?: string;
  /** Every field value for the slot, from `slotDetails()`. */
  slotDetails: readonly SlotDetail[];
  /** The same values on one line, from `summarizeSlotValues()`, for the preview text. */
  slotSummary: string;
  notes?: string | null;
  organizerDisplayName?: string;
  /** Per-signup opt-out link. Reminders are the only email it silences. */
  unsubscribeUrl?: string;
}

export function ReminderEmail({
  participantName,
  signupTitle,
  signupUrl,
  manageUrl,
  slotDetails,
  slotSummary,
  notes,
  organizerDisplayName,
  unsubscribeUrl,
}: ReminderEmailProps) {
  return (
    <EmailLayout preview={reminderSubject(signupTitle, slotSummary)}>
      <Heading as="h1" className="m-0 text-xl font-semibold">
        Coming up
      </Heading>
      <Text className="mt-2 text-[#5b6474]">
        Hi {participantName}, this is a reminder that you signed up for{' '}
        <strong>{signupTitle}</strong>
        {organizerDisplayName ? (
          <>
            {' '}
            with <strong>{organizerDisplayName}</strong>
          </>
        ) : null}
        .
      </Text>
      <SlotDetailsText details={slotDetails} />
      {notes ? (
        <Text className="mt-4 rounded-lg bg-[#f7f8fa] p-3 text-[#0b1220]">
          <strong>Your notes:</strong> {notes}
        </Text>
      ) : null}
      <Button
        href={manageUrl ?? signupUrl}
        className="mt-6 inline-block rounded-lg bg-[#1f6feb] px-5 py-3 text-sm font-medium text-white no-underline"
      >
        {manageUrl ? 'View or change your slot' : 'View signup'}
      </Button>
      <Text className="mt-6 text-xs text-[#8a93a4]">
        Need to change or cancel? Tap the button above — it opens your sign-up directly, no password
        needed. Keep this email to yourself: anyone with the link can change your slot.
      </Text>
      {unsubscribeUrl ? (
        <Text className="mt-4 text-xs text-[#8a93a4]">
          You&apos;ll still get a confirmation if you sign up for something new.{' '}
          {/*
            Nothing may follow this link in the sentence. react-email renders a
            <Link> in plaintext as "label\nURL", so trailing punctuation lands
            hard against the bare URL and clients that autolink plaintext
            commonly swallow it into the href — which would break the one link
            that must never break.
          */}
          <Link href={unsubscribeUrl} className="text-[#8a93a4] underline">
            Stop reminders for {signupTitle}
          </Link>
        </Text>
      ) : null}
    </EmailLayout>
  );
}

export default ReminderEmail;
