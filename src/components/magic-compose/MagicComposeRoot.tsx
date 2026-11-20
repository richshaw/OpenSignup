'use client';

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { DraftPreview } from '@/app/api/signups/magic-compose/preview';
import { FormError } from '@/components/ui/form-error';
import type { DraftWarning } from '@/lib/magic-compose/draft-warnings';
import { LLM_TIMEOUT_DEFAULT_MS } from '@/lib/magic-compose/limits';
import type { FollowUp, MagicComposeQuestions } from '@/lib/magic-compose/questions';
import type { Answers } from './answers';
import { ChunkBoundary } from './ChunkBoundary';
import { Compose } from './Compose';
import { Drafting } from './Drafting';
import {
  explainDraftFailure,
  type DraftError,
  type DraftErrorBody,
  type DraftErrorTranslators,
} from './draft-errors';
import { useHandFillHref } from './hand-fill';
import { writeAiDraftWarnings } from './ai-draft-warnings';
import { signupTabPath } from '@/lib/organizer-paths';

// The questions, and the Drafting from card after them, show only once the AI
// has replied, so they stay out of the page's first-load JavaScript
// (budgets.json). A first call starts loading them as it goes out, so they're
// ready by the time a reply asks. A preload that fails is left for the lazy
// import to retry, and for `ChunkBoundary` to catch when that fails too.
const Questions = lazy(() => import('./Questions').then((m) => ({ default: m.Questions })));

function preloadQuestions() {
  import('./Questions').catch(() => {});
  import('./DraftingFrom').catch(() => {});
}

interface DraftResponse {
  id: string;
}

interface ApiBody {
  data?: {
    id?: string;
    draft?: DraftPreview;
    /** What Magic Compose changed in the draft, as codes the banner words. */
    codedWarnings?: DraftWarning[];
    /** A first call the model answered with questions instead of a draft. */
    questions?: MagicComposeQuestions;
  };
  error?: DraftErrorBody;
}

/**
 * Compose (`idle`, or `error` after a failed first call) → `drafting` → the
 * builder, or → `questions` → `drafting` with the answers → the builder. A call
 * with answers that fails or is cancelled comes back to `questions`, never to
 * compose, so every answer stays in front of the organizer. Back from the
 * questions is `idle` with `back`, which focuses the description.
 */
type Phase =
  | { kind: 'idle'; back?: true }
  | {
      kind: 'drafting';
      followUp: FollowUp | null;
      draft: DraftPreview | null;
      response: DraftResponse | null;
      animationDone: boolean;
    }
  | { kind: 'error'; error: DraftError }
  | { kind: 'questions'; error: DraftError | null };

/** Where a failed call shows its error: on the questions it answered, or on compose. */
function failed(followUp: FollowUp | null, error: DraftError): Phase {
  return followUp ? { kind: 'questions', error } : { kind: 'error', error };
}

/**
 * How long past the server's `LLM_TIMEOUT_MS` the drafting phase waits before
 * giving up. The animation adds ~6s; the rest is headroom, so the page never
 * gives up before the server does, and still shows an error rather than
 * spinning forever if the response never arrives.
 */
const DRAFTING_WATCHDOG_HEADROOM_MS = 30_000;

/**
 * Magic Compose's screens, under the `ClientMessages` its page gives them
 * (`MAGIC_COMPOSE_NAMESPACES`), in the organizer's language. The dates,
 * times and numbers the screens write are in that language too.
 */
export function MagicComposeRoot({
  llmTimeoutMs = LLM_TIMEOUT_DEFAULT_MS,
}: {
  /** The instance's `LLM_TIMEOUT_MS`. */
  llmTimeoutMs?: number;
}) {
  const locale = useLocale();
  const compose = useTranslations('organizer.compose.errors');
  const errors = useTranslations('organizer.errors');
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [prompt, setPrompt] = useState('');
  const [questions, setQuestions] = useState<MagicComposeQuestions | null>(null);
  // Held here, not by the questions screen, so they outlive a Cancel or an error.
  const [answers, setAnswers] = useState<Answers | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (phase.kind !== 'drafting') return;
    if (phase.animationDone && phase.response) {
      router.push(`${signupTabPath(phase.response.id, 'build')}?aiDraft=1`);
    }
  }, [phase, router]);

  useEffect(() => {
    if (phase.kind !== 'drafting') return;
    const timer = setTimeout(() => {
      abortRef.current?.abort();
      abortRef.current = null;
      setPhase((p) => {
        const followUp = p.kind === 'drafting' ? p.followUp : null;
        // A call with answers comes back to the questions, where there's no prompt to simplify.
        return failed(followUp, {
          kind: 'message',
          text: followUp ? compose('slowWithAnswers') : compose('slow'),
        });
      });
    }, llmTimeoutMs + DRAFTING_WATCHDOG_HEADROOM_MS);
    return () => clearTimeout(timer);
  }, [phase.kind, llmTimeoutMs, compose]);

  const request = useCallback(
    async (followUp: FollowUp | null) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;

      const controller = new AbortController();
      abortRef.current = controller;
      setPhase({ kind: 'drafting', followUp, draft: null, response: null, animationDone: false });
      if (!followUp) preloadQuestions();

      try {
        const res = await fetch('/api/signups/magic-compose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(followUp ? { prompt: trimmed, followUp } : { prompt: trimmed }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        // A body that isn't JSON throws a SyntaxError, which the catch below
        // turns into the same "unexpected response" message.
        const body = (await res.json()) as ApiBody | null;
        if (controller.signal.aborted) return;

        const data = body?.data;
        // Only a first call can ask: one with answers drafts or fails.
        if (res.ok && !followUp && data?.questions) {
          setQuestions(data.questions);
          setAnswers(null);
          setPhase({ kind: 'questions', error: null });
          return;
        }
        if (!res.ok || !data?.id || !data.draft) {
          const error = explainDraftFailure(
            res.status,
            body?.error,
            { compose, errors },
            { followUp },
          );
          setPhase(failed(followUp, error));
          return;
        }

        const id = data.id;
        const draft = data.draft;
        writeAiDraftWarnings(id, data.codedWarnings ?? []);

        setPhase((p) => (p.kind === 'drafting' ? { ...p, draft, response: { id } } : p));
      } catch (e) {
        if (controller.signal.aborted) return;
        setPhase(failed(followUp, { kind: 'message', text: explainFetchError(e, compose) }));
      }
    },
    [prompt, compose, errors],
  );

  const onDraft = useCallback(() => void request(null), [request]);
  const onSend = useCallback((followUp: FollowUp) => void request(followUp), [request]);

  const onInvalid = useCallback((text: string) => {
    setPhase({ kind: 'questions', error: { kind: 'message', text } });
  }, []);

  // Back to compose with the answers written into the description, so it can
  // all be changed as one text, and focus at its end. The next Draft my signup
  // is a first call again.
  const onBack = useCallback((description: string) => {
    setPrompt(description);
    setQuestions(null);
    setAnswers(null);
    setPhase({ kind: 'idle', back: true });
  }, []);

  // The questions can't show: their code won't load, most likely because a
  // deploy replaced it, or they throw while rendering. Back to compose, with
  // the description in its box to copy before a reload.
  const onQuestionsUnavailable = useCallback(() => {
    setQuestions(null);
    setAnswers(null);
    setPhase({ kind: 'error', error: { kind: 'message', text: compose('questionsUnavailable') } });
  }, [compose]);

  const onCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase((p) =>
      p.kind === 'drafting' && p.followUp ? { kind: 'questions', error: null } : { kind: 'idle' },
    );
  }, []);

  const onAnimationDone = useCallback(() => {
    setPhase((p) => (p.kind === 'drafting' ? { ...p, animationDone: true } : p));
  }, []);

  if (phase.kind === 'drafting') {
    return (
      <Drafting
        prompt={prompt}
        locale={locale}
        followUp={phase.followUp}
        draft={phase.draft}
        onCancel={onCancel}
        onAnimationDone={onAnimationDone}
      />
    );
  }

  if (phase.kind === 'questions' && questions) {
    // Until the questions' code is in, the screen goes on reading.
    return (
      <ChunkBoundary fallback={null} onError={onQuestionsUnavailable}>
        <Suspense
          fallback={
            <Drafting
              prompt={prompt}
              locale={locale}
              draft={null}
              onCancel={onCancel}
              onAnimationDone={onAnimationDone}
            />
          }
        >
          <Questions
            prompt={prompt}
            locale={locale}
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            error={
              phase.error && (
                <FormError>
                  <DraftErrorText error={phase.error} prompt={prompt} />
                </FormError>
              )
            }
            onBack={onBack}
            onSend={onSend}
            onInvalid={onInvalid}
          />
        </Suspense>
      </ChunkBoundary>
    );
  }

  return (
    <>
      {phase.kind === 'error' && (
        <div className="mx-auto mt-6 max-w-[760px]">
          <FormError>
            <DraftErrorText error={phase.error} prompt={prompt} />
          </FormError>
        </div>
      )}
      <Compose
        prompt={prompt}
        setPrompt={setPrompt}
        onDraft={onDraft}
        focusAtEnd={phase.kind === 'idle' && phase.back === true}
      />
    </>
  );
}

function DraftErrorText({ error, prompt }: { error: DraftError; prompt: string }) {
  const t = useTranslations('organizer.compose.errors');
  const handFill = useHandFillHref(prompt);
  if (error.kind === 'message') return <>{error.text}</>;
  return t.rich('hourlyLimit', {
    minutes: error.minutes,
    link: (chunks) => (
      <Link href={handFill} className="font-medium underline">
        {chunks}
      </Link>
    ),
  });
}

/**
 * Translate the various shapes `fetch` rejects with into a single
 * actionable sentence. Raw browser strings ("Failed to fetch", "Load
 * failed", "NetworkError when attempting to fetch resource") are not
 * actionable; abort errors are handled by the caller before we land here.
 */
export function explainFetchError(e: unknown, t: DraftErrorTranslators['compose']): string {
  if (e instanceof DOMException && e.name === 'AbortError') return t('cancelled');
  if (e instanceof TypeError) return t('offline');
  if (e instanceof SyntaxError) return t('unexpected');
  return t('unknown');
}
