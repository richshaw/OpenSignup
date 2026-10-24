import { Link, Text } from '@react-email/components';
import { slotChangedSubject } from '../subjects';
import type { SlotDetail } from '@/lib/slot-label';
import { EmailButton, EmailHeading, EmailIntro, EmailLayout, NotesText } from './layout';
import { SlotDetailsText } from './slot-details';

export interface SlotChangedEmailProps {
  participantName: string;
  signupTitle: string;
  /** The participant's own token-bearing link, as in the reminder. */
  manageUrl: string;
  /** Every field value for the slot, from `slotDetails()`. */
  slotDetails: readonly SlotDetail[];
  /** The same values on one line, from `summarizeSlotValues()`, for the preview text. */
  slotSummary: string;
  notes?: string | null;
  /** Per-signup opt-out link. It silences reminders and these emails alike. */
  unsubscribeUrl: string;
}

/** Sent when the organizer moves a slot to a new date or time. */
export function SlotChangedEmail({
  participantName,
  signupTitle,
  manageUrl,
  slotDetails,
  slotSummary,
  notes,
  unsubscribeUrl,
}: SlotChangedEmailProps) {
  return (
    <EmailLayout preview={slotChangedSubject(signupTitle, slotSummary)}>
      <EmailHeading>Your slot has changed</EmailHeading>
      <EmailIntro>
        Hi {participantName}, the organizer of <strong>{signupTitle}</strong> moved your slot to a
        new date or time. Here are the new details.
      </EmailIntro>
      <SlotDetailsText details={slotDetails} />
      <NotesText notes={notes} />
      <EmailButton href={manageUrl}>View or change your slot</EmailButton>
      <Text className="mt-6 text-xs text-[#8a93a4]">
        Can&apos;t make the new time? Tap the button above to change or cancel. It opens your spot
        directly, no password needed. Keep this email to yourself: anyone with the link can change
        your slot.
      </Text>
      <Text className="mt-4 text-xs text-[#8a93a4]">
        You&apos;ll still get a confirmation if you sign up for something new.{' '}
        {/* Nothing may follow this link in the sentence: see reminder.tsx. */}
        <Link href={unsubscribeUrl} className="text-[#8a93a4] underline">
          Stop reminders and updates for {signupTitle}
        </Link>
      </Text>
    </EmailLayout>
  );
}

export default SlotChangedEmail;
