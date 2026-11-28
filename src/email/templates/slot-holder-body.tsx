import { Text } from '@react-email/components';
import type { ReactNode } from 'react';
import type { CatalogLocale } from '@/i18n/config';
import type { SlotDetail } from '@/lib/slot-label';
import {
  EmailHeading,
  EmailIntro,
  EmailLayout,
  ManageButton,
  NotesText,
  UnsubscribeFooter,
} from './layout';
import { SlotDetailsText } from './slot-details';

/** What the worker's emails to the people holding a slot know about it. */
export interface SlotHolderEmailProps {
  /** The email's language: its signup's (`localeOfSignup`). */
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
  /** How many spots the participant took; the email says so when it's more than one. */
  quantity?: number;
  /** Per-signup opt-out link. It silences reminders and slot-change emails. */
  unsubscribeUrl: string;
}

/**
 * The body the reminder and the slot-change email share, so the two can't
 * drift apart: each picks its own words and subject, and this lays them out.
 * `stop` is the opt-out link's label, which `UnsubscribeFooter` puts last.
 */
export function SlotHolderEmailBody({
  locale,
  slotDetails,
  notes,
  quantity,
  manageUrl,
  unsubscribeUrl,
  preview,
  heading,
  intro,
  keep,
  stop,
}: Pick<
  SlotHolderEmailProps,
  'locale' | 'slotDetails' | 'notes' | 'quantity' | 'manageUrl' | 'unsubscribeUrl'
> & {
  preview: string;
  heading: ReactNode;
  intro: ReactNode;
  keep: ReactNode;
  stop: ReactNode;
}) {
  return (
    <EmailLayout locale={locale} preview={preview}>
      <EmailHeading>{heading}</EmailHeading>
      <EmailIntro>{intro}</EmailIntro>
      <SlotDetailsText locale={locale} details={slotDetails} spots={quantity} />
      <NotesText locale={locale} notes={notes} />
      <ManageButton locale={locale} href={manageUrl} />
      <Text className="mt-6 text-xs text-[#8a93a4]">{keep}</Text>
      <UnsubscribeFooter locale={locale} href={unsubscribeUrl}>
        {stop}
      </UnsubscribeFooter>
    </EmailLayout>
  );
}
