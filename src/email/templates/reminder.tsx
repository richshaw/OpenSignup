import { Link, Text } from '@react-email/components';
import { reminderSubject } from '../subjects';
import type { SlotDetail } from '@/lib/slot-label';
import { EmailButton, EmailHeading, EmailIntro, EmailLayout, NotesText } from './layout';
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
  /** Per-signup opt-out link. Reminders are the only email it silences. */
  unsubscribeUrl: string;
}

export function ReminderEmail({
  participantName,
  signupTitle,
  manageUrl,
  slotDetails,
  slotSummary,
  notes,
  unsubscribeUrl,
}: ReminderEmailProps) {
  return (
    <EmailLayout preview={reminderSubject(signupTitle, slotSummary)}>
      <EmailHeading>Coming up</EmailHeading>
      <EmailIntro>
        Hi {participantName}, this is a reminder that you signed up for{' '}
        <strong>{signupTitle}</strong>.
      </EmailIntro>
      <SlotDetailsText details={slotDetails} />
      <NotesText notes={notes} />
      <EmailButton href={manageUrl}>View or change your slot</EmailButton>
      <Text className="mt-6 text-xs text-[#8a93a4]">
        Need to change or cancel? Tap the button above. It opens your spot directly, no password
        needed. Keep this email to yourself: anyone with the link can change your slot.
      </Text>
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
    </EmailLayout>
  );
}

export default ReminderEmail;
