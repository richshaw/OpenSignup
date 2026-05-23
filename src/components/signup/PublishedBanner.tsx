'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Banner } from '@/components/banner';

export function PublishedBanner({ signupStatus }: { signupStatus: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showFromUrl = searchParams.get('published') === '1';
  const [dismissed, setDismissed] = useState(false);

  if (!showFromUrl || dismissed || signupStatus !== 'open') return null;

  const onDismiss = () => {
    setDismissed(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('published');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <Banner
      kind="published"
      title="Signup published"
      body="Your signup is live. Share the public link to start collecting responses."
      onDismiss={onDismiss}
    />
  );
}
