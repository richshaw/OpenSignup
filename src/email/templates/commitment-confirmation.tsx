import { Text } from '@react-email/components';
import { confirmationSubject } from '../subjects';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import type { SlotDetail } from '@/lib/slot-label';
import { REMINDER_LEAD_WORDS } from '@/lib/reminder-lead';
import { EmailButton, EmailHeading, EmailIntro, EmailLayout, NotesText } from './layout';
import { SlotDetailsText } from './slot-details';

export interface CommitmentConfirmationEmailProps {
  /** The email's language: its signup's (`emailLocale`). */
  locale: CatalogLocale;
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
  locale,
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
    <EmailLayout
      preview={confirmationSubject(
        getServerTranslator(locale, 'email.subject'),
        signupTitle,
        slotSummary,
      )}
    >
      <EmailHeading>You&apos;re signed up</EmailHeading>
      <EmailIntro>
        Thanks {participantName}, you signed up for <strong>{signupTitle}</strong>.
      </EmailIntro>
      <SlotDetailsText details={slotDetails} spots={quantity} />
      <NotesText notes={notes} />
      <EmailButton href={manageUrl}>View or change your slot</EmailButton>
      <Text className="mt-6 text-xs text-[#8a93a4]">
        Keep this email. The button above is how you change or cancel later, with no password to
        remember. Anyone with that link can change your slot, so don&apos;t forward it.
        {promisesReminder ? <> We&apos;ll also send you a reminder {REMINDER_LEAD_WORDS}.</> : null}
      </Text>
    </EmailLayout>
  );
}
