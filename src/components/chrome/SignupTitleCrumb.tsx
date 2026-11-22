import { getOrganizerSession, toActor } from '@/auth/session';
import { Crumb } from '@/components/chrome/Crumb';
import { langWhereDifferent } from '@/i18n/config';
import { localeOfOrganizer, localeOfSignup } from '@/i18n/locale';
import { loadSignupForOrganizer } from '@/services/signups.cached';

type CrumbParams = { params: Promise<{ id: string }> };

/**
 * The signup's title as the last crumb, shared by the signup's tabs
 * (build, responses, settings), marked with the signup's language where it
 * isn't the organizer's, which the crumbs around it are in. The bare
 * `/app/signups/<id>` redirects to `/build`, so it has no crumb of its own.
 */
export async function SignupTitleCrumb({ params }: CrumbParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return null;
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  const lang = langWhereDifferent(localeOfSignup(sig.settings.locale), localeOfOrganizer(session));
  return <Crumb lang={lang}>{sig.title}</Crumb>;
}
