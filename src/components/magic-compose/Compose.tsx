'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { STARTER_PROMPTS } from '@/lib/magic-compose/templates';

export function Compose({
  prompt,
  setPrompt,
  onDraft,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  onDraft: () => void;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(160, ta.scrollHeight)}px`;
  }, [prompt]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (prompt.trim()) onDraft();
    }
  };

  return (
    <div className="mx-auto mt-6 flex max-w-[760px] flex-col gap-7">
      <header className="flex flex-col items-start gap-2.5">
        <span className="bg-brand/10 text-brand inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium tracking-wide">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          New signup
        </span>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-[44px]">
          What are you organizing?
        </h1>
        <p className="text-ink-muted text-base leading-relaxed md:text-lg">
          The more detail you share, the better the draft. We&apos;ll turn it into a title, blurb, and slots for you to edit.
        </p>
      </header>

      <div className="border-surface-sunk overflow-hidden rounded-2xl border bg-white shadow-sm transition focus-within:border-brand">
        <textarea
          ref={taRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. Snack duty for our U9 soccer team. 6 Saturday games starting April 25, two families per game, no nuts please."
          className="text-ink min-h-[160px] w-full resize-none border-0 bg-white px-6 pt-5 pb-3 text-base leading-relaxed outline-none"
        />
        <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-2 pb-3">
          <Link
            href="/app/signups/new?manual=1"
            className="text-ink border-surface-sunk hover:bg-surface-raised inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium"
          >
            Skip, fill in by hand
          </Link>
          <button
            type="button"
            onClick={onDraft}
            disabled={!prompt.trim()}
            className="bg-brand inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Draft my signup
          </button>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="text-ink-muted text-sm font-medium">Or start from an example</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {STARTER_PROMPTS.map((s) => {
            const isCurrent = prompt === s.body;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setPrompt(s.body)}
                className={`group flex flex-col items-start gap-1.5 rounded-2xl border bg-white px-4 pt-4 pb-3.5 text-left transition ${
                  isCurrent
                    ? 'border-brand shadow-[0_0_0_3px_rgb(31_111_235_/_0.1)]'
                    : 'border-surface-sunk hover:bg-surface-raised'
                }`}
              >
                <div className="text-ink text-sm font-semibold">{s.label}</div>
                <div className="text-ink-muted min-h-[38px] text-[13px] leading-snug">
                  {s.blurb}
                </div>
                <div
                  className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                    isCurrent ? 'text-brand' : 'text-ink-soft'
                  }`}
                >
                  {isCurrent ? (
                    <>
                      <Check className="h-3 w-3" aria-hidden="true" /> Loaded
                    </>
                  ) : (
                    <>
                      Try this <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="border-surface-sunk flex flex-col gap-3.5 border-t pt-5">
        <div className="text-ink-muted text-sm font-medium">Tips for a better draft</div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Tip
            title="Mention dates"
            body={'A range like \u201CSaturdays Apr 25 to May 30\u201D lets us generate one slot per date.'}
          />
          <Tip
            title="Say how many"
            body={'\u201CTwo families per game\u201D or \u201Csix volunteers per shift\u201D, so we can set capacity.'}
          />
          <Tip
            title="Flag the gotchas"
            body="Allergies, locations, no-shows policy. Anything participants should know."
          />
        </div>
      </section>
    </div>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-ink mb-1 text-[13px] font-semibold">{title}</div>
      <div className="text-ink-muted text-[13px] leading-relaxed">{body}</div>
    </div>
  );
}
