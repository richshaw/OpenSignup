import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

/**
 * A small tinted note inside a builder panel: something the organizer should
 * know about what they are editing, not an error and not a save result.
 */
export function InlineNote({
  id,
  className = '',
  children,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      {...(id ? { id } : {})}
      role="note"
      className={`flex items-start gap-1.5 rounded-md bg-brand/10 px-2.5 py-2 text-[11px] leading-[1.35] text-ink-muted ${className}`}
    >
      <Info size={12} className="mt-px shrink-0 text-brand" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
