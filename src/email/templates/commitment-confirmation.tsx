import { Button, Heading, Text } from '@react-email/components';
import { confirmationSubject } from '../subjects';
import type { SlotDetail } from '@/lib/slot-label';
import { EmailLayout } from './layout';
import { SlotDetailsText } from './slot-details';

export interface CommitmentConfirmationEmailProps {
  participantName: string;
  signupTitle: string;
  /** The participant's own token-bearing link to view, change, or cancel. */
  manageUrl: string;
  /** Every field value for the slot, from `slotDetails()`. */
  slotDetails: readonly SlotDetail[];
  /** The same values on one line, from `summarizeSlotValues()`, for the preview text. */
  slotSummary: string;
  notes?: string | null;
  quantity?: number;
  /**
   * True when this signup will also send a reminder the day before the slot.
   * Decide it with `willSendReminder` so the receipt never promises a reminder
   * the dispatcher will not send.
   */
  promisesReminder?: boolean;
}

export function CommitmentConfirmationEmail({
  participantName,
  signupTitle,
  manageUrl,
  slotDetails,
  slotSummary,
  notes,
  quantity,
  promisesReminder,
}: CommitmentConfirmationEmailProps) {
  return (
    <EmailLayout preview={confirmationSubject(signupTitle, slotSummary)}>
      <Heading as="h1" className="m-0 text-xl font-semibold">
        You&apos;re signed up
      </Heading>
      <Text className="mt-2 text-[#5b6474]">
        Thanks {participantName}, you signed up for <strong>{signupTitle}</strong>.
      </Text>
      <SlotDetailsText details={slotDetails} spots={quantity} />
      {notes ? (
        <Text className="mt-4 rounded-lg bg-[#f7f8fa] p-3 text-[#0b1220]">
          <strong>Your notes:</strong> {notes}
        </Text>
      ) : null}
      <Button
        href={manageUrl}
        className="mt-6 inline-block rounded-lg bg-[#1f6feb] px-5 py-3 text-sm font-medium text-white no-underline"
      >
        View or change your slot
      </Button>
      <Text className="mt-6 text-xs text-[#8a93a4]">
        Keep this email. The button above is how you change or cancel later, with no password to
        remember. Anyone with that link can change your slot, so don&apos;t forward it.
        {promisesReminder ? <> We&apos;ll also send you a reminder the day before.</> : null}
      </Text>
    </EmailLayout>
  );
}

export default CommitmentConfirmationEmail;
