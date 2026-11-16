import { Text } from '@react-email/components';
import { reminderSubject } from '../subjects';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import type { SlotDetail } from '@/lib/slot-label';
import {
  EmailHeading,
  EmailIntro,
  EmailLayout,
  ManageButton,
  NotesText,
  strong,
  UnsubscribeFooter,
} from './layout';
import { SlotDetailsText } from './slot-details';

export interface ReminderEmailProps {
  /** The email's language: its signup's (`emailLocale`). */
  locale: CatalogLocale;
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
  locale,
  participantName,
  signupTitle,
  manageUrl,
  slotDetails,
  slotSummary,
  notes,
  unsubscribeUrl,
  changed = false,
}: ReminderEmailProps) {
  const t = getServerTranslator(locale, 'email.reminder');
  const intro = { name: participantName, title: signupTitle, b: strong };
  return (
    <EmailLayout
      locale={locale}
      preview={reminderSubject(
        getServerTranslator(locale, 'email.subject'),
        signupTitle,
        slotSummary,
        changed,
      )}
    >
      <EmailHeading>{changed ? t('changed.heading') : t('heading')}</EmailHeading>
      <EmailIntro>{changed ? t.rich('changed.intro', intro) : t.rich('intro', intro)}</EmailIntro>
      <SlotDetailsText locale={locale} details={slotDetails} />
      <NotesText locale={locale} notes={notes} />
      <ManageButton locale={locale} href={manageUrl} />
      <Text className="mt-6 text-xs text-[#8a93a4]">{t('keep')}</Text>
      <UnsubscribeFooter locale={locale} href={unsubscribeUrl}>
        {t('stop', { title: signupTitle })}
      </UnsubscribeFooter>
    </EmailLayout>
  );
}
