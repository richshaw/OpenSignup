'use client';

import { Banner } from '@/components/banner';
import { useDismissibleQueryFlag } from '@/hooks/useDismissibleQueryFlag';

export function PublishedBanner({ signupStatus }: { signupStatus: string }) {
  const [shown, dismiss] = useDismissibleQueryFlag('published');

  if (!shown || signupStatus !== 'open') return null;

  return (
    <Banner
      kind="published"
      title="Signup published"
      body="Your signup is live. Share the public link to start collecting responses."
      onDismiss={dismiss}
    />
  );
}
