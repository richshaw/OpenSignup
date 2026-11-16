import { defaultFor } from '@/i18n/config';
import { instanceDefaultLocale } from '@/i18n/server';
import { GONE_PAGE } from './gone-message';
import { SignupStateMessage } from './state-message';

/**
 * What `notFound()` renders on `/s/[slug]`, in place of Next's bare 404.
 * The status stays 404. Edit links have their own (`./c/[id]/not-found.tsx`).
 * A deleted or unknown slug has no language anyone may read, so the message
 * is in the instance's language for participants.
 */
export default function SignupNotFound() {
  return (
    <SignupStateMessage
      locale={defaultFor('participant', instanceDefaultLocale())}
      {...GONE_PAGE.signup}
    />
  );
}
