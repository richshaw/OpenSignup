import { Button, Heading, Text } from '@react-email/components';
import { EmailLayout } from './layout';

export interface CommitmentConfirmationEmailProps {
  participantName: string;
  signupTitle: string;
  /** The participant's own token-bearing link to view, change, or cancel. */
  manageUrl: string;
  slotLabel: string;
  /** Rendered slot date, or null for an undated slot. */
  slotDateLabel?: string | null;
  notes?: string | null;
  quantity?: number;
  /** Set when this signup will also send a reminder before the slot. */
  reminderLeadHours?: number | null;
}

function reminderSentence(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? 'the day before' : `${days} days before`;
  }
  return hours === 1 ? 'an hour before' : `${hours} hours before`;
}

export function CommitmentConfirmationEmail({
  participantName,
  signupTitle,
  manageUrl,
  slotLabel,
  slotDateLabel,
  notes,
  quantity,
  reminderLeadHours,
}: CommitmentConfirmationEmailProps) {
  const preview = `You're signed up: ${slotLabel} · ${signupTitle}`;
  return (
    <EmailLayout preview={preview}>
      <Heading as="h1" className="m-0 text-xl font-semibold">
        You&apos;re signed up
      </Heading>
      <Text className="mt-2 text-[#5b6474]">
        Thanks {participantName} — you&apos;re down for <strong>{signupTitle}</strong>.
      </Text>
      <Text className="mt-4 text-[#0b1220]">
        <strong>What:</strong> {slotLabel}
        {slotDateLabel ? (
          <>
            <br />
            <strong>When:</strong> {slotDateLabel}
          </>
        ) : null}
        {quantity && quantity > 1 ? (
          <>
            <br />
            <strong>Spots:</strong> {quantity}
          </>
        ) : null}
      </Text>
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
        Keep this email — the button above is how you change or cancel later, with no password to
        remember. Anyone with that link can change your slot, so don&apos;t forward it.
        {reminderLeadHours ? (
          <> We&apos;ll also send you a reminder {reminderSentence(reminderLeadHours)}.</>
        ) : null}
      </Text>
    </EmailLayout>
  );
}

export default CommitmentConfirmationEmail;
