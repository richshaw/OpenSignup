import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './layout';

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
  slotLabel: string;
  slotDateLabel: string;
  notes?: string | null;
  organizerDisplayName?: string;
}

export function ReminderEmail({
  participantName,
  signupTitle,
  signupUrl,
  manageUrl,
  slotLabel,
  slotDateLabel,
  notes,
  organizerDisplayName,
}: ReminderEmailProps) {
  const preview = `Reminder: ${slotLabel} · ${signupTitle}`;
  return (
    <EmailLayout preview={preview}>
      <Heading as="h1" className="m-0 text-xl font-semibold">
        Coming up: {slotLabel}
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
      <Text className="mt-4 text-[#0b1220]">
        <strong>When:</strong> {slotDateLabel}
        <br />
        <strong>What:</strong> {slotLabel}
      </Text>
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
        Need to change or cancel? Tap the button above — it opens your sign-up directly, no
        password needed. Keep this email to yourself: anyone with the link can change your slot.
      </Text>
    </EmailLayout>
  );
}

export default ReminderEmail;
