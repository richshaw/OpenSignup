import { subjectOf } from '../subjects';
import { getServerTranslator } from '@/i18n/server';
import { strong } from './layout';
import { SlotHolderEmailBody, type SlotHolderEmailProps } from './slot-holder-body';

export interface ReminderEmailProps extends SlotHolderEmailProps {
  /**
   * The last email the participant got was for a different slot time: the
   * organizer has moved the slot since, so the email says so rather than
   * repeating itself. Its heading is then the slot-change email's.
   */
  changed?: boolean;
}

export function ReminderEmail({ changed = false, ...props }: ReminderEmailProps) {
  const { locale, participantName, signupTitle, slotSummary } = props;
  const t = getServerTranslator(locale, 'email.reminder');
  const slotChanged = getServerTranslator(locale, 'email.slotChanged');
  const intro = { name: participantName, title: signupTitle, b: strong };
  return (
    <SlotHolderEmailBody
      {...props}
      preview={subjectOf.reminder({ locale, signupTitle, slotSummary, changed })}
      heading={changed ? slotChanged('heading') : t('heading')}
      intro={changed ? t.rich('changed.intro', intro) : t.rich('intro', intro)}
      keep={t('keep')}
      stop={t('stop', { title: signupTitle })}
    />
  );
}
