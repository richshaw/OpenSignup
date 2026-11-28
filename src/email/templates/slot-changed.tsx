import { subjectOf } from '../subjects';
import { getServerTranslator } from '@/i18n/server';
import { strong } from './layout';
import { SlotHolderEmailBody, type SlotHolderEmailProps } from './slot-holder-body';

export type SlotChangedEmailProps = SlotHolderEmailProps;

/** Sent when the organizer moves a slot to a new date or time. */
export function SlotChangedEmail(props: SlotChangedEmailProps) {
  const { locale, participantName, signupTitle, slotSummary } = props;
  const t = getServerTranslator(locale, 'email.slotChanged');
  return (
    <SlotHolderEmailBody
      {...props}
      preview={subjectOf.slotChanged({ locale, signupTitle, slotSummary })}
      heading={t('heading')}
      intro={t.rich('intro', { name: participantName, title: signupTitle, b: strong })}
      keep={t('keep')}
      stop={t('stop', { title: signupTitle })}
    />
  );
}
