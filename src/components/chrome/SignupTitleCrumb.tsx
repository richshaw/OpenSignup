import { getOrganizerSession, toActor } from '@/auth/session';
import { Crumb } from '@/components/chrome/Crumb';
import { langWhereDifferent } from '@/i18n/config';
import { getOrganizerAppLocale } from '@/i18n/organizer';
import { localeOfSignup } from '@/i18n/locale';
import { loadSignupForOrganizer } from '@/services/signups.cached';

type CrumbParams = { params: Promise<{ id: string }> };

/**
 * The signup's title as the last crumb, shared by the signup page and its
 * tabs, marked with the signup's language where it isn't the organizer's,
 * which the crumbs around it are in.
 */
export async function SignupTitleCrumb({ params }: CrumbParams) {
  const { id } = await params;
  const session = await getOrganizerSession();
  if (!session) return null;
  const result = await loadSignupForOrganizer(toActor(session), id);
  if (!result.ok) return null;
  const sig = result.value;
  const lang = langWhereDifferent(
    localeOfSignup(sig.settings.locale),
    getOrganizerAppLocale(session),
  );
  return (
    <Crumb truncate lang={lang}>
      {sig.title}
    </Crumb>
  );
}
