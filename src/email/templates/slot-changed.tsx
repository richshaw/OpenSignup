import { Text } from '@react-email/components';
import { slotChangedSubject } from '../subjects';
import { getServerTranslator } from '@/i18n/server';
import {
  EmailHeading,
  EmailIntro,
  EmailLayout,
  ManageButton,
  NotesText,
  strong,
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
  const t = getServerTranslator(locale, 'email.slotChanged');
  return (
    <EmailLayout
      locale={locale}
      preview={slotChangedSubject(
        getServerTranslator(locale, 'email.subject'),
        signupTitle,
        slotSummary,
      )}
    >
      <EmailHeading>{t('heading')}</EmailHeading>
      <EmailIntro>
        {t.rich('intro', { name: participantName, title: signupTitle, b: strong })}
      </EmailIntro>
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
