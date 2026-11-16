import { Text } from '@react-email/components';
import { confirmationSubject } from '../subjects';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import type { SlotDetail } from '@/lib/slot-label';
import { REMINDER_LEAD_HOURS } from '@/lib/reminder-lead';
import { EmailHeading, EmailIntro, EmailLayout, ManageButton, NotesText, strong } from './layout';
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
  const t = getServerTranslator(locale, 'email.confirmation');
  return (
    <EmailLayout
      locale={locale}
      preview={confirmationSubject(
        getServerTranslator(locale, 'email.subject'),
        signupTitle,
        slotSummary,
      )}
    >
      <EmailHeading>{t('heading')}</EmailHeading>
      <EmailIntro>
        {t.rich('intro', { name: participantName, title: signupTitle, b: strong })}
      </EmailIntro>
      <SlotDetailsText locale={locale} details={slotDetails} spots={quantity} />
      <NotesText locale={locale} notes={notes} />
      <ManageButton locale={locale} href={manageUrl} />
      <Text className="mt-6 text-xs text-[#8a93a4]">
        {t('keep', {
          reminder: promisesReminder ? 'yes' : 'no',
          // When the reminder goes out, as the message words it: "the day
          // before" for 24 hours.
          hours: REMINDER_LEAD_HOURS,
        })}
      </Text>
    </EmailLayout>
  );
}
