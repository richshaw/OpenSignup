import { GONE_PAGE } from './gone-message';
import { requestedSignupLocale } from './signup-locale';
import { SignupStateMessage } from './state-message';

/**
 * What `notFound()` renders on `/s/[slug]`, in place of Next's bare 404.
 * The status stays 404. Edit links have their own (`./c/[id]/not-found.tsx`).
 * A not-found page gets no params, so the language comes from the path the
 * middleware copies into a header. The page sends a deleted or unknown slug
 * here, which has no language anyone may read, so the message is in the
 * instance's language for participants either way and never says which.
 */
export default async function SignupNotFound() {
  return <SignupStateMessage locale={await requestedSignupLocale()} {...GONE_PAGE.signup} />;
}
