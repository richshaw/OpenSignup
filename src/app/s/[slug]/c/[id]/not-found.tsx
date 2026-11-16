import { getServerTranslator } from '@/i18n/server';
import { gonePage } from '../../gone-message';
import { requestedSignupLocale } from '../../signup-locale';
import { SignupStateMessage } from '../../state-message';

/**
 * What `notFound()` renders on an edit link, in place of the signup page's
 * not-found (`../../not-found.tsx`), whose "no longer available" would be
 * wrong for a link that was only cut short. The status stays 404. It's in
 * the language of the signup the link's path names, found through the path
 * the middleware copies into a header (a not-found page gets no params). That
 * depends on the slug alone, which the signup page answers for anyway, so it
 * says nothing about whether the sign-up was ever there.
 */
export default async function EditLinkNotFound() {
  const locale = await requestedSignupLocale();
  const copy = gonePage(getServerTranslator(locale, 'participant.gonePage')).editLink;
  return <SignupStateMessage locale={locale} {...copy} />;
}
