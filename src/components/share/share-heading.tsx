import { Check } from 'lucide-react';

/**
 * The share panel's heading. Kept apart from the panel's body, which loads
 * only once it opens, so a phone's sheet can name itself with the same
 * words the moment it opens.
 */
export function shareHeading(firstTime: boolean): string {
  return firstTime ? 'Now send people the link' : 'Share the link';
}

/** The small green "Published" over the heading, the first time only. */
export function PublishedMark({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[13px] font-semibold text-success ${className}`}
    >
      <Check size={14} strokeWidth={2.6} aria-hidden="true" />
      Published
    </span>
  );
}
