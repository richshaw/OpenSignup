import { GONE_PAGE } from '../../gone-message';
import { SignupStateMessage } from '../../state-message';

/**
 * What `notFound()` renders on an edit link, in place of the signup page's
 * not-found (`../../not-found.tsx`), whose "no longer available" would be
 * wrong for a link that was only cut short. The status stays 404.
 */
export default function EditLinkNotFound() {
  return <SignupStateMessage {...GONE_PAGE.editLink} />;
}
