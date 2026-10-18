'use client';

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Whether `?<name>=1` is in the URL and hasn't been dismissed. `dismiss` hides
 * it at once and drops the flag from the URL, keeping the rest of the query.
 */
export function useDismissibleQueryFlag(name: string): [shown: boolean, dismiss: () => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const dismiss = () => {
    setDismissed(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete(name);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  };

  return [searchParams.get(name) === '1' && !dismissed, dismiss];
}
