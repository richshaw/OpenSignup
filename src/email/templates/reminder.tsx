import { Text } from '@react-email/components';
import { reminderSubject } from '../subjects';
import type { SlotDetail } from '@/lib/slot-label';
import {
  EmailButton,
  EmailHeading,
  EmailIntro,
  EmailLayout,
  NotesText,
  UnsubscribeFooter,
} from './layout';
import { SlotDetailsText } from './slot-details';

export interface ReminderEmailProps {
  participantName: string;
  signupTitle: string;
  /**
   * The participant's own token-bearing link. Participants have no account to
   * sign in to, so this is the only way they can reach their commitment from a
   * device that has lost the returning-participant cookie.
   */
  manageUrl: string;
  /** Every field value for the slot, from `slotDetails()`. */
  slotDetails: readonly SlotDetail[];
  /** The same values on one line, from `summarizeSlotValues()`, for the preview text. */
  slotSummary: string;
  notes?: string | null;
  /** Per-signup opt-out link. It silences reminders and slot-change emails. */
  unsubscribeUrl: string;
  /**
   * The last email the participant got was for a different slot time: the
   * organizer has moved the slot since, so the email says so rather than
   * repeating itself.
   */
  changed?: boolean;
}

export function ReminderEmail({
  participantName,
  signupTitle,
  manageUrl,
  slotDetails,
  slotSummary,
  notes,
  unsubscribeUrl,
  changed = false,
}: ReminderEmailProps) {
  return (
    <EmailLayout preview={reminderSubject(signupTitle, slotSummary, changed)}>
      <EmailHeading>{changed ? 'Your slot has changed' : 'Coming up'}</EmailHeading>
      {changed ? (
        <EmailIntro>
          Hi {participantName}, the organizer changed your slot for <strong>{signupTitle}</strong>{' '}
          since we last emailed you. Here are the new details.
        </EmailIntro>
      ) : (
        <EmailIntro>
          Hi {participantName}, this is a reminder that you signed up for{' '}
          <strong>{signupTitle}</strong>.
        </EmailIntro>
      )}
      <SlotDetailsText details={slotDetails} />
      <NotesText notes={notes} />
      <EmailButton href={manageUrl}>View or change your slot</EmailButton>
      <Text className="mt-6 text-xs text-[#8a93a4]">
        Need to change or cancel? Tap the button above. It opens your spot directly, no password
        needed. Keep this email to yourself: anyone with the link can change your slot.
      </Text>
      <UnsubscribeFooter href={unsubscribeUrl}>Stop reminders for {signupTitle}</UnsubscribeFooter>
    </EmailLayout>
  );
}
