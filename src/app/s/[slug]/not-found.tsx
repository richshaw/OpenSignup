import { GONE_PAGE } from './gone-message';
import { SignupStateMessage } from './state-message';

/**
 * What `notFound()` renders on `/s/[slug]`, in place of Next's bare 404.
 * The status stays 404. Edit links have their own (`./c/[id]/not-found.tsx`).
 */
export default function SignupNotFound() {
  return <SignupStateMessage {...GONE_PAGE.signup} />;
}
