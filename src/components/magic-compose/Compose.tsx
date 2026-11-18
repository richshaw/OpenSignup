'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { PROMPT_MAX_LENGTH } from '@/lib/magic-compose/limits';
import { starterPrompts } from '@/lib/magic-compose/templates';
import { handFillHref } from './hand-fill';

/** The count shows from this many characters, so it's there before Back's answers tip it over. */
const COUNT_FROM = Math.round(PROMPT_MAX_LENGTH * 0.9);
const COUNT_ID = 'compose-count';

export function Compose({
  prompt,
  setPrompt,
  onDraft,
  focusAtEnd = false,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  onDraft: () => void;
  /** Back from the questions: focus the description, with the caret after the answers. */
  focusAtEnd?: boolean;
}) {
  const t = useTranslations('organizer.compose');
  const starters = starterPrompts(useTranslations('organizer.compose.starters'));
  const taRef = useRef<HTMLTextAreaElement>(null);
  // A hard maxLength would cut off the answers Back adds, so the box takes
  // any length and Draft waits until it's short enough.
  const over = prompt.length - PROMPT_MAX_LENGTH;
  const canDraft = prompt.trim() !== '' && over <= 0;
  const showCount = prompt.length >= COUNT_FROM;

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.max(160, ta.scrollHeight)}px`;
  }, [prompt]);

  useEffect(() => {
    const ta = taRef.current;
    if (!focusAtEnd || !ta) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }, [focusAtEnd]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canDraft) onDraft();
    }
  };

  return (
    <div className="mx-auto mt-6 flex max-w-[760px] flex-col gap-7">
      <header className="flex flex-col items-start gap-2.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium tracking-wide text-brand">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {t('eyebrow')}
        </span>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight md:text-[44px]">
          {t('heading')}
        </h1>
        <p className="text-base leading-relaxed text-ink-muted md:text-lg">
          {t.rich('intro', {
            strong: (chunks) => <span className="font-medium text-ink">{chunks}</span>,
          })}
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-surface-sunk bg-white shadow-sm transition focus-within:border-brand">
        <textarea
          ref={taRef}
          aria-label={t('describe')}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={showCount ? COUNT_ID : undefined}
          placeholder={t('placeholder')}
          className="min-h-[160px] w-full resize-none border-0 bg-white px-6 pb-3 pt-5 text-base leading-relaxed text-ink outline-none"
        />
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-2">
          {showCount && (
            <p
              id={COUNT_ID}
              className={`mr-auto px-2 text-[13px] ${over > 0 ? 'font-medium text-danger' : 'text-ink-muted'}`}
            >
              {over > 0
                ? t('countOver', { count: prompt.length, max: PROMPT_MAX_LENGTH, over })
                : t('count', { count: prompt.length, max: PROMPT_MAX_LENGTH })}
            </p>
          )}
          {/* On a phone the two stack full width, since half a row is too narrow
              for some labels; on a wider screen they sit side by side, each as
              wide as the longer label, so they match in either language. On a
              phone Draft goes on top, as on the questions screen. Draft's
              transparent border gives it Skip's height. */}
          <div className="grid w-full grid-cols-1 gap-2 sm:ml-auto sm:w-max sm:grid-cols-2">
            <Link
              href={handFillHref(prompt, starters)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-surface-sunk bg-white px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface-raised"
            >
              {t('skip')}
            </Link>
            <button
              type="button"
              onClick={onDraft}
              disabled={!canDraft}
              className="order-first inline-flex items-center justify-center gap-2 rounded-xl border border-transparent bg-brand px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 sm:order-none"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('draft')}
            </button>
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="text-sm font-medium text-ink-muted">{t('examples')}</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {starters.map((s) => {
            const isCurrent = prompt === s.body;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setPrompt(s.body)}
                className={`group flex flex-col items-start gap-1.5 rounded-2xl border bg-white px-4 pb-3.5 pt-4 text-left transition ${
                  isCurrent
                    ? 'border-brand shadow-[0_0_0_3px_rgb(31_111_235_/_0.1)]'
                    : 'border-surface-sunk hover:bg-surface-raised'
                }`}
              >
                <div className="text-sm font-semibold text-ink">{s.label}</div>
                <div className="min-h-[38px] text-[13px] leading-snug text-ink-muted">
                  {s.blurb}
                </div>
                <div
                  className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${
                    isCurrent ? 'text-brand' : 'text-ink-soft'
                  }`}
                >
                  {isCurrent ? (
                    <>
                      <Check className="h-3 w-3" aria-hidden="true" /> {t('loaded')}
                    </>
                  ) : (
                    <>
                      {t('tryThis')} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-3.5 border-t border-surface-sunk pt-5">
        <div className="text-sm font-medium text-ink-muted">{t('tips.heading')}</div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          <Tip title={t('tips.dates.title')} body={t('tips.dates.body')} />
          <Tip title={t('tips.howMany.title')} body={t('tips.howMany.body')} />
          <Tip title={t('tips.gotchas.title')} body={t('tips.gotchas.body')} />
        </div>
      </section>
    </div>
  );
}

function Tip({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold text-ink">{title}</div>
      <div className="text-[13px] leading-relaxed text-ink-muted">{body}</div>
    </div>
  );
}
