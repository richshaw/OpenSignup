'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Banner } from '@/components/banner';

export function AiDraftBanner({
  fieldsCount,
  slotsCount,
}: {
  fieldsCount: number;
  slotsCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showFromUrl = searchParams.get('aiDraft') === '1';
  const [dismissed, setDismissed] = useState(false);

  if (!showFromUrl || dismissed) return null;

  const onDismiss = () => {
    setDismissed(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('aiDraft');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div className="mb-4">
      <Banner
        kind="aiDraft"
        title={`Here's your draft, ${fieldsCount} ${
          fieldsCount === 1 ? 'column' : 'columns'
        } and ${slotsCount} ${slotsCount === 1 ? 'slot' : 'slots'}`}
        body="Edit anything below, then publish when you're ready."
        action={{ label: 'Re-draft', href: '/app/signups/new' }}
        onDismiss={onDismiss}
      />
    </div>
  );
}
