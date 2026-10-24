'use client';

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { DraftPreview } from '@/app/api/signups/magic-compose/preview';
import { FormError } from '@/components/ui/form-error';
import type { FollowUp, MagicComposeQuestions } from '@/lib/magic-compose/questions';
import type { Answers } from './answers';
import { ChunkBoundary } from './ChunkBoundary';
import { Compose } from './Compose';
import { Drafting } from './Drafting';
import { explainDraftFailure, type DraftError, type DraftErrorBody } from './draft-errors';
import { writeAiDraftWarnings } from './ai-draft-warnings';

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
    warnings?: string[];
    /** A first call whose description doesn't say what people sign up for. */
    questions?: MagicComposeQuestions;
  };
  error?: DraftErrorBody;
}

/**
 * Compose (`idle`, or `error` after a failed first call) → `drafting` → the
 * builder, or → `questions` → `drafting` with the answers → the builder. A call
 * with answers that fails or is cancelled comes back to `questions`, never to
 * compose, so every answer stays in front of the organizer.
 */
type Phase =
  | { kind: 'idle' }
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
 * Hard ceiling on the drafting phase. The LLM timeout is 180s server-side
 * and the animation adds ~6s. We give it generous headroom and then surface
 * an error rather than spinning forever if the response never arrives.
 */
const DRAFTING_WATCHDOG_MS = 210_000;

/**
 * When the questions can't show: their code won't load, most likely because a
 * deploy replaced it, or they throw while rendering.
 */
const QUESTIONS_UNAVAILABLE: DraftError = {
  kind: 'message',
  text: "The questions couldn't be shown. Reload the page and try again; copy your description first if you want to keep it.",
};

export function MagicComposeRoot() {
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
      router.push(`/app/signups/${phase.response.id}/build?aiDraft=1`);
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
          text: followUp
            ? 'AI drafting is taking longer than expected. Try again.'
            : 'AI drafting is taking longer than expected. Try again or simplify your prompt.',
        });
      });
    }, DRAFTING_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [phase.kind]);

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
          setPhase(failed(followUp, explainDraftFailure(res.status, body?.error)));
          return;
        }

        const id = data.id;
        const draft = data.draft;
        writeAiDraftWarnings(id, data.warnings ?? []);

        setPhase((p) => (p.kind === 'drafting' ? { ...p, draft, response: { id } } : p));
      } catch (e) {
        if (controller.signal.aborted) return;
        setPhase(failed(followUp, { kind: 'message', text: explainFetchError(e) }));
      }
    },
    [prompt],
  );

  const onDraft = useCallback(() => void request(null), [request]);
  const onSend = useCallback((followUp: FollowUp) => void request(followUp), [request]);

  const onInvalid = useCallback((text: string) => {
    setPhase({ kind: 'questions', error: { kind: 'message', text } });
  }, []);

  // Back to compose with the answers written into the description, so it can
  // all be changed as one text. The next Draft my signup is a first call again.
  const onBack = useCallback((description: string) => {
    setPrompt(description);
    setQuestions(null);
    setAnswers(null);
    setPhase({ kind: 'idle' });
  }, []);

  // The questions can't show: back to compose, with the description in its
  // box to copy before a reload.
  const onQuestionsUnavailable = useCallback(() => {
    setQuestions(null);
    setAnswers(null);
    setPhase({ kind: 'error', error: QUESTIONS_UNAVAILABLE });
  }, []);

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
              draft={null}
              onCancel={onCancel}
              onAnimationDone={onAnimationDone}
            />
          }
        >
          <Questions
            prompt={prompt}
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            error={
              phase.error && (
                <FormError>
                  <DraftErrorText error={phase.error} />
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
            <DraftErrorText error={phase.error} />
          </FormError>
        </div>
      )}
      <Compose prompt={prompt} setPrompt={setPrompt} onDraft={onDraft} />
    </>
  );
}

function DraftErrorText({ error }: { error: DraftError }) {
  if (error.kind === 'message') return <>{error.text}</>;
  return (
    <>
      You&apos;ve used this hour&apos;s AI drafts. Try again in {error.minutes}{' '}
      {error.minutes === 1 ? 'minute' : 'minutes'}, or{' '}
      <Link href="/app/signups/new?manual=1" className="font-medium underline">
        fill it in by hand
      </Link>
      .
    </>
  );
}

/**
 * Translate the various shapes `fetch` rejects with into a single
 * actionable sentence. Raw browser strings ("Failed to fetch", "Load
 * failed", "NetworkError when attempting to fetch resource") are not
 * actionable; abort errors are handled by the caller before we land here.
 */
export function explainFetchError(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') {
    return 'Request was cancelled.';
  }
  if (e instanceof TypeError) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (e instanceof SyntaxError) {
    return 'The server returned an unexpected response. Try again.';
  }
  return 'Something went wrong while drafting. Try again.';
}
