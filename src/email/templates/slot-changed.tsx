import { Text } from '@react-email/components';
import { slotChangedSubject } from '../subjects';
import { getServerTranslator } from '@/i18n/server';
import {
  EmailButton,
  EmailHeading,
  EmailIntro,
  EmailLayout,
  NotesText,
  UnsubscribeFooter,
} from './layout';
import type { ReminderEmailProps } from './reminder';
import { SlotDetailsText } from './slot-details';

/** The reminder's props without `changed`: both emails are built from the same `workerEmailParts`. */
export type SlotChangedEmailProps = Omit<ReminderEmailProps, 'changed'>;

/** Sent when the organizer moves a slot to a new date or time. */
export function SlotChangedEmail({
  locale,
  participantName,
  signupTitle,
  manageUrl,
  slotDetails,
  slotSummary,
  notes,
  unsubscribeUrl,
}: SlotChangedEmailProps) {
  return (
    <EmailLayout
      preview={slotChangedSubject(
        getServerTranslator(locale, 'email.subject'),
        signupTitle,
        slotSummary,
      )}
    >
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
      <UnsubscribeFooter href={unsubscribeUrl}>
        Stop reminders and updates for {signupTitle}
      </UnsubscribeFooter>
    </EmailLayout>
  );
}
