import { PublicLinkChip } from '@/components/PublicLinkChip';
import type { SharePanelProps } from './SharePanel';

/**
 * What the share panel shows when its code couldn't load (a weak signal, or
 * a tab left open across an update): the public link chip, with its copy
 * button, and a line saying a reload brings the rest back. Without it, the
 * failed load would take the page down with it. The chip is in every signup
 * page's first load already, so this costs next to nothing there.
 */
export function ShareUnavailable({ signupId, url }: Pick<SharePanelProps, 'signupId' | 'url'>) {
  return (
    <div className="flex flex-col items-start gap-3">
      {/* A copy here is the share panel's, not the header's. */}
      <PublicLinkChip url={url} signupId={signupId} surface="share_panel" />
      <p className="text-[13px] leading-snug text-ink-muted">
        Couldn’t load the other ways to share. Reload to try again.
      </p>
    </div>
  );
}
