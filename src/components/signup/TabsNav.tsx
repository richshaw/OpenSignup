'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

interface TabsNavProps {
  signupId: string;
  counts: {
    build: number;
    responses: number;
  };
}

const TABS = [
  { id: 'build', label: 'Build' },
  { id: 'responses', label: 'Responses' },
  { id: 'settings', label: 'Settings' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function TabsNav({ signupId, counts }: TabsNavProps) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  const activeTab: TabId = (() => {
    const segment = pathname.split('/').pop() ?? '';
    const match = TABS.find((t) => t.id === segment);
    return match ? match.id : 'build';
  })();

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [activeTab]);

  return (
    <div
      role="tablist"
      aria-label="Signup sections"
      className="-mx-4 mb-2 flex overflow-x-auto border-b border-surface-sunk px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const active = t.id === activeTab;
        const count =
          t.id === 'build'
            ? counts.build
            : t.id === 'responses'
              ? counts.responses
              : null;
        return (
          <Link
            key={t.id}
            ref={active ? activeRef : null}
            href={`/app/signups/${signupId}/${t.id}`}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition ${
              active
                ? 'border-brand text-ink font-semibold'
                : 'text-ink-muted hover:text-ink border-transparent font-medium'
            }`}
          >
            {t.label}
            {count != null ? (
              <span
                className={`inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none ${
                  active ? 'bg-brand/10 text-brand' : 'bg-surface-raised text-ink-muted'
                }`}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
