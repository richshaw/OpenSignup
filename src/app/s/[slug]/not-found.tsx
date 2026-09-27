import { GONE_PAGE } from './gone-message';
import { SignupStateMessage } from './state-message';

/**
 * What `notFound()` renders on `/s/[slug]` and on an edit link under
 * `c/[id]`, in place of Next's bare 404. The status stays 404.
 */
export default function SignupNotFound() {
  return <SignupStateMessage title={GONE_PAGE.title} body={GONE_PAGE.body} />;
}
