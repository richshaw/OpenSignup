import Link from 'next/link';
import { ClientMessages } from '@/i18n/ClientMessages';
import type { CatalogLocale } from '@/i18n/config';
import { getServerTranslator } from '@/i18n/server';
import { messagesFor, type Translator } from '@/i18n/translator';
import { isBlankSlotValue } from '@/lib/blank-slot-value';
import { willSendReminder } from '@/lib/reminder-eligibility';
import { Banner } from '@/components/banner';
import { COMMIT_DIALOG_NAMESPACES } from './client-namespaces';
import CommitDialog from './commit-dialog';
import { toSignupViewSignup, toSignupViewSlots } from './public-signup';
import {
  ACTION_SIZING,
  buildMetaSegments,
  capacityLabel,
  slotAccessibleName,
  slotContext,
  slotDisplayName,
  formatGroupLabel,
  pickPrimaryField,
  renderFieldValue,
} from './slot-format';
import type {
  OwnCommitment,
  SignupViewField,
  SignupViewSignup,
  SignupViewSlot,
} from './signup-view-types';

export type { SignupViewField, SignupViewSlot };

/**
 * Everything the page needs from a signup as a service loads it, with the
 * sign-up counts per slot; the live page and the organizer's preview both pass
 * them, so a preview of a live signup shows the spots left. A field
 * definition already fits `SignupViewField`, so the fields go as they are.
 */
export function toSignupViewProps(
  signup: Parameters<typeof toSignupViewSlots>[0] &
    Parameters<typeof toSignupViewSignup>[0] & { slug: string },
  committedBySlot?: Record<string, number>,
): Pick<SignupViewProps, 'signup' | 'fields' | 'groupByRef' | 'slots' | 'slug'> {
  return {
    signup: toSignupViewSignup(signup),
    fields: signup.fields,
    groupByRef: signup.settings.groupByFieldRefs?.[0] ?? null,
    slots: toSignupViewSlots(signup, committedBySlot),
    slug: signup.slug,
  };
}

interface SignupViewCommonProps {
  signup: SignupViewSignup;
  fields: SignupViewField[];
  groupByRef: string | null;
  slots: SignupViewSlot[];
  slug: string;
  /**
   * The language slot dates and times are read in: the signup's own
   * (`localeOfSignup`), worked out by each page that shows it.
   */
  locale: CatalogLocale;
  ownCommitments?: OwnCommitment[];
  /** Show the preview/closed status banner. Default true; set false when the
   *  surrounding context already conveys preview state (e.g. the build rail). */
  showStateBanner?: boolean;
}

/**
 * - 'live': real signup, real CommitDialog.
 * - 'preview': organizer-only preview (Build tab); Sign-up button is
 *   disabled and the preview banner explains why.
 * - 'showcase': marketing/example use (homepage); Sign-up button is rendered
 *   as an inert solid-blue span so the card matches a published signup
 *   visually. The wrapping context must convey that it's not real.
 */
type SignupViewProps = SignupViewCommonProps &
  (
    | { mode: 'live' | 'showcase' }
    | {
        mode: 'preview';
        /**
         * The language of the Preview banner and the disabled button's tip,
         * which are the organizer's, not the participants': the organizer
         * app's for the organizer looking (`localeOfOrganizer`).
         */
        organizerLocale: CatalogLocale;
      }
  );

/** The Preview's tip, which describes each disabled Sign up button. One per page. */
const PREVIEW_TIP_ID = 'preview-sign-up-tip';

interface SlotGroup {
  key: string;
  label: string;
  slots: SignupViewSlot[];
}

function groupSlots(
  slots: SignupViewSlot[],
  groupField: SignupViewField | null,
  locale: CatalogLocale,
  tSlot: Translator<'participant.slot'>,
): SlotGroup[] {
  if (!groupField) return [{ key: '__all__', label: '', slots }];
  // A Map keeps its keys in the order they were first set, so the groups come
  // out in the order of their first slot.
  const map = new Map<string, SlotGroup>();
  for (const slot of slots) {
    const raw = slot.values[groupField.ref];
    const key = isBlankSlotValue(raw) ? '__unset__' : String(raw);
    const label = formatGroupLabel(groupField, raw, locale, tSlot);
    const existing = map.get(key);
    if (existing) {
      existing.slots.push(slot);
    } else {
      map.set(key, { key, label, slots: [slot] });
    }
  }
  return [...map.values()];
}

/**
 * The group a slot's name starts with, or null when the signup isn't grouped
 * or the slot has no value for the group field: "(no date)" heads that group
 * on the page, but says nothing in a slot's name.
 */
function nameGroupFor(
  slot: SignupViewSlot,
  groupField: SignupViewField | null,
  locale: CatalogLocale,
  tSlot: Translator<'participant.slot'>,
): string | null {
  if (!groupField) return null;
  const raw = slot.values[groupField.ref];
  return isBlankSlotValue(raw) ? null : formatGroupLabel(groupField, raw, locale, tSlot);
}

function titleFor(
  slot: SignupViewSlot,
  primary: SignupViewField | null,
  locale: CatalogLocale,
  t: Translator<'participant.signupView'>,
): string {
  const value = primary ? renderFieldValue(primary, slot.values[primary.ref], locale) : null;
  return value || t('untitledSlot');
}

export function SignupViewBody(props: SignupViewProps) {
  const {
    signup,
    fields,
    groupByRef,
    slots,
    slug,
    locale,
    mode,
    ownCommitments,
    showStateBanner = true,
  } = props;
  const t = getServerTranslator(locale, 'participant.signupView');
  const tSlot = getServerTranslator(locale, 'participant.slot');
  // The live row's Sign up is the dialog's, which reads these in the browser;
  // the Preview's disabled button and the showcase's stand-in say the same.
  const tDialog = getServerTranslator(locale, 'participant.dialog');
  const isPreview = mode === 'preview';
  // The Preview banner and the disabled button's tip are the organizer's, not
  // the participants': in the organizer app's language, and marked so where
  // the element allows, since a preview is otherwise in the signup's.
  const preview =
    props.mode === 'preview'
      ? {
          locale: props.organizerLocale,
          t: getServerTranslator(props.organizerLocale, 'organizer.preview'),
        }
      : null;
  const effectiveStatus = isPreview && signup.status === 'draft' ? 'open' : signup.status;
  const groupField = groupByRef ? (fields.find((f) => f.ref === groupByRef) ?? null) : null;
  const groupRef = groupField?.ref ?? null;
  const primary = pickPrimaryField(fields, groupRef);
  const primaryRef = primary?.ref;
  const groups = groupSlots(slots, groupField, locale, tSlot);
  const ownBySlot = new Map((ownCommitments ?? []).map((c) => [c.slotId, c]));
  const firstOwn = ownCommitments?.[0] ?? null;
  const ownCount = ownCommitments?.length ?? 0;
  const firstOwnSlot = firstOwn ? (slots.find((s) => s.id === firstOwn.slotId) ?? null) : null;
  const firstOwnName = firstOwnSlot
    ? slotDisplayName(
        nameGroupFor(firstOwnSlot, groupField, locale, tSlot),
        titleFor(firstOwnSlot, primary, locale, t),
        buildMetaSegments({ fields, slot: firstOwnSlot, primaryRef, groupRef, locale }),
      )
    : '';
  const Title = mode === 'showcase' ? 'h2' : 'h1';

  // Closing only stops new sign-ups: everyone keeps their place and can still
  // change or cancel it, so a returning participant sees this bar under the
  // Closed banner too.
  const signedUpBar = firstOwn ? (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-sunk bg-success/5 px-4 py-3 text-sm">
      <span>
        {t.rich('signedUp', {
          count: ownCount,
          name: firstOwnName,
          b: (chunks) => <span className="font-medium">{chunks}</span>,
          slot: (chunks) => <span className="font-medium text-ink">{chunks}</span>,
        })}
      </span>
      <Link href={firstOwn.editUrl} className="shrink-0 font-medium text-brand hover:underline">
        {ownCount === 1 ? t('editOrCancel') : t('manage')}
      </Link>
    </div>
  ) : null;

  const view = (
    <>
      {!showStateBanner ? null : preview ? (
        // A wrapper for its language, rather than a prop on the shared
        // Banner, so the organizer pages' banners stay byte for byte as they
        // were. It lays out as the banner alone would.
        <div lang={preview.locale}>
          <Banner
            kind="preview"
            title={preview.t('title')}
            body={preview.t('body', { status: signup.status })}
          />
        </div>
      ) : effectiveStatus === 'closed' ? (
        <>
          <Banner
            kind="closed"
            title={t('closedBanner.title')}
            body={
              firstOwn ? t('closedBanner.keepsYours', { count: ownCount }) : t('closedBanner.body')
            }
          />
          {signedUpBar}
        </>
      ) : (
        signedUpBar
      )}

      <header className="space-y-2">
        {/* On /s/[slug] this title *is* the page heading, so it's an h1. In
            'showcase' mode the card is embedded in a page that already has its
            own h1 (the marketing headline), and a second h1 is an SEO defect —
            demote to h2 there. Styling is identical either way. */}
        <Title className="text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">
          {signup.title}
        </Title>
        {signup.description ? (
          <p className="whitespace-pre-line text-ink-muted [overflow-wrap:anywhere]">
            {signup.description}
          </p>
        ) : null}
      </header>

      <div className="flex flex-col gap-7">
        {groups.map((group) => (
          <section key={group.key} className="flex flex-col gap-2.5">
            {groupField ? (
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                {group.label}
              </h2>
            ) : null}
            <ul className="overflow-hidden rounded-2xl border border-surface-sunk bg-white">
              {group.slots.map((slot, idx) => {
                // Floored at 0: the organizer can lower a slot's capacity below
                // its sign-ups.
                const spotsLeft =
                  slot.capacity === null ? null : Math.max(0, slot.capacity - slot.committed);
                const full = spotsLeft === 0;
                const closed = slot.status !== 'open' || effectiveStatus !== 'open' || full;
                const title = titleFor(slot, primary, locale, t);
                const meta = buildMetaSegments({ fields, slot, primaryRef, groupRef, locale });
                const own = ownBySlot.get(slot.id) ?? null;
                const isOwn = own !== null;
                // A closed row says "Closed" (or "Full"), and "2 left" beside it
                // would offer spots nobody can take.
                const count = closed
                  ? { text: '', sr: null }
                  : capacityLabel(slot.committed, slot.capacity, tSlot);
                const actionName = slotAccessibleName(group.label || null, title, meta);
                const nameGroup = nameGroupFor(slot, groupField, locale, tSlot);
                return (
                  <li
                    key={slot.id}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-[18px] sm:py-3 ${
                      idx > 0 ? 'border-t border-surface-sunk' : ''
                    } ${isOwn ? 'bg-success/5' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium tracking-tight">{title}</p>
                      {meta.length ? (
                        // Wrapped, not `truncate`. The fixed right rail left
                        // ~160px for text at 390px, so one clamped line dropped
                        // the last segment — usually the location — from every
                        // row. The title above stays single-line.
                        //
                        // Three lines below `sm`, because a row that also shows
                        // a count has a third column competing for a 360px
                        // screen and two lines still clipped the location. This
                        // is a ceiling, not a height: short meta still wraps to
                        // one line.
                        <p className="line-clamp-3 text-sm text-ink-muted sm:line-clamp-2">
                          {meta.join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {count.text ? (
                        // `min-w`, not `w`: a fixed 36px column clipped "10/12".
                        <span className="min-w-9 text-right text-sm tabular-nums text-ink-muted">
                          <span aria-hidden="true">{count.text}</span>
                          <span className="sr-only">{count.sr}</span>
                        </span>
                      ) : null}
                      <div className="flex">
                        {own ? (
                          <Link
                            href={own.editUrl}
                            aria-label={t('editFor', { slot: actionName })}
                            className={`${ACTION_SIZING} border border-surface-sunk bg-white font-medium transition hover:bg-surface-raised`}
                          >
                            {t('edit')}
                          </Link>
                        ) : closed ? (
                          <span className={`${ACTION_SIZING} font-medium text-ink-soft`}>
                            {full ? t('full') : t('closed')}
                          </span>
                        ) : preview ? (
                          // The button's name and text are the participants',
                          // in the signup's language. Its tip is the
                          // organizer's: a mouse gets it from `title`, which
                          // can't carry a language of its own, and screen
                          // readers from PREVIEW_TIP_ID, which does.
                          <button
                            type="button"
                            disabled
                            title={preview.t('signUpDisabled', { status: signup.status })}
                            aria-label={tDialog('signUpFor', { slot: actionName })}
                            aria-describedby={PREVIEW_TIP_ID}
                            className={`${ACTION_SIZING} cursor-not-allowed bg-brand font-medium text-white opacity-60`}
                          >
                            {tDialog('signUp')}
                          </button>
                        ) : mode === 'showcase' ? (
                          <span className={`${ACTION_SIZING} bg-brand font-medium text-white`}>
                            {tDialog('signUp')}
                          </span>
                        ) : (
                          <CommitDialog
                            slotId={slot.id}
                            slotTitle={title}
                            actionName={actionName}
                            slotName={slotDisplayName(nameGroup, title, meta)}
                            slotContext={slotContext(nameGroup, meta)}
                            slotAt={slot.slotAt}
                            slotHasTime={slot.hasTime}
                            spotsLeft={spotsLeft}
                            capacity={slot.capacity}
                            signupTitle={signup.title}
                            slug={slug}
                            requireEmail={signup.requireEmail ?? true}
                            sendsReminder={willSendReminder({
                              sendReminders: signup.sendReminders ?? false,
                              slotAt: slot.slotAt ? new Date(slot.slotAt) : null,
                            })}
                          />
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {preview ? (
        // The disabled Sign up buttons' tip, as their description: in the
        // organizer's language and marked with it, which their `title`
        // can't be. Hidden, since a mouse gets the same words from the title.
        <p id={PREVIEW_TIP_ID} lang={preview.locale} hidden>
          {preview.t('signUpDisabled', { status: signup.status })}
        </p>
      ) : null}
    </>
  );
  if (mode !== 'live') return view;
  // The sign-up dialog's text, which it reads in the browser: only the live
  // page has the dialog, and the messages go into the page with it.
  return (
    <ClientMessages locale={locale} messages={messagesFor(locale, COMMIT_DIALOG_NAMESPACES)}>
      {view}
    </ClientMessages>
  );
}

export default function SignupView(props: SignupViewProps) {
  return (
    <div className="container-tight flex flex-col gap-7">
      <SignupViewBody {...props} />
    </div>
  );
}
