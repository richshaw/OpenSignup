import type { ReactNode } from 'react';
import { Calendar, Check, ListChecks } from 'lucide-react';
import { followUpItems, type FollowUp } from '@/lib/magic-compose/questions';
import { formatOneDay } from './answers';
import { YouWrote } from './YouWrote';

const LEFT_BLANK = ['All answered', 'One left blank', 'Two left blank'];

function countLabel(count: number | null): string {
  if (count === null) return 'No limit';
  return count === 1 ? '1 person' : `${count} people`;
}

/**
 * What a draft from answers is being made from: the description, each thing
 * with its count, and the day. Shown while the second call runs, so the
 * organizer can see their answers went with it.
 */
export function DraftingFrom({ prompt, followUp }: { prompt: string; followUp: FollowUp }) {
  const items = followUpItems(followUp);
  const { when, howMany } = followUp;
  const blanks = (items.length === 0 ? 1 : 0) + (when?.kind === 'not_decided' ? 1 : 0);

  return (
    <section
      aria-label="Drafting from"
      className="overflow-hidden rounded-lg border border-surface-sunk bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-surface-sunk bg-surface-raised px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          Drafting from
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            blanks === 0 ? 'bg-success/10 text-success' : 'bg-surface-sunk text-ink-muted'
          }`}
        >
          {blanks === 0 && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
          {LEFT_BLANK[blanks]}
        </span>
      </div>
      <YouWrote prompt={prompt} variant="plain" />
      <dl className="flex flex-col px-4 pb-1.5">
        <Row icon={<ListChecks className="h-4 w-4" />} term="What">
          {items.length === 0 ? (
            <Blank>Not decided. The draft will use placeholder slots you can fill in later.</Blank>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {items.map((item, i) => (
                <li
                  key={item}
                  className="flex items-baseline justify-between gap-3 text-[15px] leading-snug"
                >
                  <span className="min-w-0">{item}</span>
                  {howMany && (
                    <span className="flex-shrink-0 text-[13px] text-ink-muted">
                      {countLabel(howMany[i] ?? null)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Row>
        {when && (
          <Row icon={<Calendar className="h-4 w-4" />} term="When">
            {when.kind === 'not_decided' ? (
              <Blank>
                Not decided. The draft will use placeholder dates you can fill in later.
              </Blank>
            ) : (
              <span className="text-[15px] leading-snug">
                {when.kind === 'several' ? when.text : oneDay(when)}
              </span>
            )}
          </Row>
        )}
      </dl>
    </section>
  );
}

function oneDay(when: Parameters<typeof formatOneDay>[0]): string {
  const { day, times } = formatOneDay(when);
  return times ? `${day} · ${times}` : day;
}

function Row({ icon, term, children }: { icon: ReactNode; term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-surface-sunk py-2.5 sm:grid sm:grid-cols-[136px_minmax(0,1fr)] sm:items-center sm:gap-3">
      <dt className="flex items-center gap-2.5 text-[13px] font-medium text-ink-muted">
        <span
          aria-hidden="true"
          className="inline-flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[9px] bg-brand-soft text-brand"
        >
          {icon}
        </span>
        {term}
      </dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

function Blank({ children }: { children: ReactNode }) {
  return <span className="text-sm leading-snug text-ink-muted">{children}</span>;
}
