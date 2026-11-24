'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useDropPendingFix } from './BuildBridge';
import type { SignupHeaderText } from './header-text';
import { signupTabPath } from '@/lib/organizer-paths';

const TABS = ['build', 'responses', 'settings'] as const;

type TabId = (typeof TABS)[number];

interface TabsNavProps {
  signupId: string;
  counts: {
    build: number;
    responses: number;
  };
  /** Each tab's name and the strip's, from the server. */
  labels: SignupHeaderText['tabs'];
}

export function TabsNav({ signupId, counts, labels }: TabsNavProps) {
  const pathname = usePathname();
  const stripRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  // A plain primary click on a tab other than Build, even the one showing,
  // means the organizer has moved on from a check's fix still on its way to
  // Build. A Ctrl, Cmd, Shift or Alt click doesn't navigate this window, and
  // a middle click never reaches onClick, so those leave it be.
  const dropPendingFix = useDropPendingFix();

  const activeTab: TabId = (() => {
    const segment = pathname.split('/').pop() ?? '';
    const match = TABS.find((id) => id === segment);
    return match ?? 'build';
  })();

  // Keeps the current tab in view when the strip scrolls sideways on a phone.
  // This scrolls the strip itself: scrollIntoView would also move where the
  // browser starts the next Tab from, so a keyboard user's first Tab would
  // skip the whole header and land on the tab after this one.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = activeRef.current;
    if (!strip || !tab) return;
    strip.scrollLeft =
      tab.offsetLeft - strip.offsetLeft - (strip.clientWidth - tab.offsetWidth) / 2;
  }, [activeTab]);

  // Below `sm` the tabs, their counts and the strip's side margin are
  // narrower, so all three tabs fit whole on a 320px screen in every
  // language (translated-organizer.spec.ts measures it).
  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={labels.strip}
      className="-mx-4 mb-2 flex overflow-x-auto border-b border-surface-sunk px-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((id) => {
        const active = id === activeTab;
        const count = id === 'build' ? counts.build : id === 'responses' ? counts.responses : null;
        return (
          <Link
            key={id}
            ref={active ? activeRef : null}
            href={signupTabPath(signupId, id)}
            {...(id === 'build'
              ? {}
              : {
                  // Not a modified click (a new tab or window, or a
                  // download): this window still goes on to Build.
                  onClick: (e: React.MouseEvent) => {
                    if (e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
                      dropPendingFix();
                    }
                  },
                })}
            role="tab"
            aria-selected={active}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-1 border-b-2 px-2 py-3 text-sm transition focus-visible:outline-offset-[-3px] sm:gap-2 sm:px-3 ${
              active
                ? 'border-brand font-semibold text-ink'
                : 'border-transparent font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {labels[id]}
            {count != null ? (
              <span
                className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 py-0.5 text-xs leading-none sm:min-w-[1.5rem] sm:px-1.5 ${
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
