'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import { requireOrganizerSession, toActor } from '@/auth/session';
import type { CatalogLocale } from '@/i18n/config';
import { getOrganizerAppLocale } from '@/i18n/organizer';
import { getServerTranslator } from '@/i18n/server';
import { refusalAsResult, type ServiceError } from '@/lib/errors';
import { requireWorkspaceWrite } from '@/lib/policy';
import {
  checkBeforePublish,
  publishCheckCopy,
  publishCheckTarget,
  type PublishCheckAnswer,
} from '@/lib/publish-check';
import { closeSignupQuestion, spotCounts } from '@/lib/spot-counts';
import { removeCommitment } from '@/services/commitments';
import {
  closeSignup,
  deleteSignup,
  getSignupForOrganizer,
  publishSignup,
  recordPublishCheck,
  reopenSignup,
  updateSignup,
} from '@/services/signups';
import { removeRefusal } from './responses/remove-refusal';
import { statusRefusal } from './status-refusal';

function revalidateSignup(id: string) {
  revalidatePath(`/app/signups/${id}`, 'layout');
}

async function requireActor() {
  return toActor(await requireOrganizerSession());
}

/** Who is acting, and the language their screens are in, for what the header shows. */
async function requireActorIn() {
  const session = await requireOrganizerSession();
  return { actor: toActor(session), locale: getOrganizerAppLocale(session) };
}

/** `statusRefusal` in `locale`. */
function refusal(
  error: ServiceError,
  change: 'publish' | 'close' | 'reopen',
  locale: CatalogLocale,
) {
  return {
    error: statusRefusal(error, change, {
      signup: getServerTranslator(locale, 'organizer.signup.refusal'),
      errors: getServerTranslator(locale, 'organizer.errors'),
    }),
  };
}

/**
 * The header's Publish, Close signup and Reopen signup. A refusal (a
 * viewer's role, a signup already published, closed or reopened in another
 * tab) returns what to tell the organizer, and revalidates nothing. It shows
 * under the header on a computer for Publish and Reopen signup, in Close
 * signup's panel, and by the button on a phone.
 *
 * All three stay on the tab they were pressed on and re-render the layout.
 * Publish says it published, which is what opens the header's share panel:
 * an answer to this press, not a flag in the URL, so a reload or a shared
 * link never opens it again. Reopen opens no panel: the link was shared when
 * the signup was first published.
 *
 * Publish first checks a draft as it's stored (the header has saved the Build
 * tab's edits by then): no slots, no fields or every slot empty answers with
 * the check and publishes nothing. A slot saying "TBD" publishes: the
 * organizer may mean it. The check
 * reads without a lock, so an edit landing between it and the publish (from
 * another tab, or an AI assistant) isn't checked: a narrow
 * race, and what's published is what the page then shows. A viewer is
 * refused before anything is checked. A signup that isn't a draft goes
 * straight to the service, which says it changed since the page loaded. The
 * service doesn't check; the MCP tool and the REST API publish without it.
 */
export async function publishAction(
  signupId: string,
): Promise<{ error: string } | { published: true } | PublishCheckAnswer> {
  const { actor, locale } = await requireActorIn();
  const db = getDb();
  const read = await refusalAsResult(async () => {
    const loaded = await getSignupForOrganizer(db, actor, signupId);
    if (loaded.ok) requireWorkspaceWrite(actor, loaded.value.workspaceId);
    return loaded;
  });
  if (!read.ok) return refusal(read.error, 'publish', locale);
  if (read.value.status === 'draft') {
    const check = checkBeforePublish(read.value);
    if (check) {
      // #525's count of refused publishes, now that the service doesn't see these.
      await refusalAsResult(() => recordPublishCheck(db, actor, signupId, check));
      const copy = publishCheckCopy(check, getServerTranslator(locale, 'organizer.signup.check'));
      return { check, copy, target: publishCheckTarget(check) };
    }
  }
  const result = await refusalAsResult(() => publishSignup(db, actor, signupId));
  if (!result.ok) return refusal(result.error, 'publish', locale);
  revalidateSignup(signupId);
  return { published: true };
}

export async function closeAction(signupId: string): Promise<{ error: string } | null> {
  const { actor, locale } = await requireActorIn();
  const result = await refusalAsResult(() => closeSignup(getDb(), actor, signupId));
  if (!result.ok) return refusal(result.error, 'close', locale);
  revalidateSignup(signupId);
  return null;
}

export async function reopenAction(signupId: string): Promise<{ error: string } | null> {
  const { actor, locale } = await requireActorIn();
  const result = await refusalAsResult(() => reopenSignup(getDb(), actor, signupId));
  if (!result.ok) return refusal(result.error, 'reopen', locale);
  revalidateSignup(signupId);
  return null;
}

/**
 * What Close signup asks, from the spots taken now. The header's counts are
 * from when the page loaded, and switching tabs doesn't reload them, so the
 * ⋯ menu asks for this as it opens. It only reads: nothing is revalidated,
 * so the page isn't rendered again and records no view. A refusal comes back
 * like Close signup's, and the menu keeps the question it has.
 */
export async function closeQuestionAction(
  signupId: string,
): Promise<{ question: string } | { error: string }> {
  const { actor, locale } = await requireActorIn();
  const result = await refusalAsResult(() =>
    getSignupForOrganizer(getDb(), actor, signupId, { includeFilled: true }),
  );
  if (!result.ok) return refusal(result.error, 'close', locale);
  const { slots, committedBySlot } = result.value;
  const t = getServerTranslator(locale, 'organizer.signup.close');
  return { question: closeSignupQuestion(spotCounts(slots, committedBySlot ?? {}), t) };
}

/**
 * Saves one Settings-tab form. Sends only `settings`, which `updateSignup`
 * merges over the stored ones, then comes back to the tab with `saved` set to
 * the form's own value, so "Saved" shows by that form. A refusal comes back
 * as its code in `error`, which the tab words at its top.
 */
async function saveSettingsForm(
  signupId: string,
  settings: Record<string, unknown>,
  saved: string,
): Promise<never> {
  const actor = await requireActor();
  const settingsPath = `/app/signups/${signupId}/settings`;
  const result = await refusalAsResult(() => updateSignup(getDb(), actor, signupId, { settings }));
  if (!result.ok) redirect(`${settingsPath}?error=${result.error.code}`);
  // This tab re-renders with the saved choice. The public page is dynamic, so
  // it reads the change on its next request.
  revalidateSignup(signupId);
  redirect(`${settingsPath}?saved=${saved}`);
}

/**
 * The Settings tab's "Ask for an email address". Anything but Optional saves
 * Required, the default.
 */
export async function setRequireEmailAction(signupId: string, formData: FormData) {
  const requireEmail = formData.get('requireEmail') !== 'optional';
  await saveSettingsForm(signupId, { requireEmail }, '1');
}

/**
 * The Settings tab's "Signup language", there once a second language has
 * shipped to participants. `updateSignup` refuses a language that hasn't
 * shipped. A form with no choice in it sends an empty string, which is refused
 * too: null would clear the stored language and still come back saying it
 * saved.
 */
export async function setSignupLocaleAction(signupId: string, formData: FormData) {
  const locale = formData.get('locale');
  await saveSettingsForm(
    signupId,
    { locale: typeof locale === 'string' ? locale : '' },
    'language',
  );
}

/**
 * The Responses tab's Remove. Once the person is off the slot, revalidates the
 * signup's pages, so the row re-renders as removed, and returns null. A
 * refusal (a viewer's role, a signup deleted meanwhile) returns what to tell
 * the organizer, by its code (`removeRefusal`), in their language, and
 * revalidates nothing: the page stays as it is, so the confirmation stays open
 * to show it. After a delete, a revalidate would swap the page for "signup not
 * found" and the message would never be seen.
 */
export async function removeCommitmentAction(
  signupId: string,
  commitmentId: string,
): Promise<{ error: string } | null> {
  const session = await requireOrganizerSession();
  const result = await refusalAsResult(() =>
    removeCommitment(getDb(), toActor(session), commitmentId, signupId),
  );
  if (!result.ok) {
    const locale = getOrganizerAppLocale(session);
    return {
      error: removeRefusal(result.error.code, {
        responses: getServerTranslator(locale, 'organizer.responses'),
        errors: getServerTranslator(locale, 'organizer.errors'),
      }),
    };
  }
  // The public page and the edit link are dynamic, so they read the change on
  // their next request.
  revalidateSignup(signupId);
  return null;
}

export async function deleteSignupAction(signupId: string) {
  const actor = await requireActor();
  const result = await refusalAsResult(() => deleteSignup(getDb(), actor, signupId));
  // Its code, which the tab words, as for Save on the same tab.
  if (!result.ok) redirect(`/app/signups/${signupId}/settings?error=${result.error.code}`);
  // Bust any open tab on the deleted signup so the next interaction shows the
  // organizer "signup not found" state instead of a stale cached layout.
  revalidatePath(`/app/signups/${signupId}`, 'layout');
  revalidatePath('/app');
  redirect('/app');
}
