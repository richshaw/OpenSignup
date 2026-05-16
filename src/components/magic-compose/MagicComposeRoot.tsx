'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DraftPreview } from '@/app/api/signups/magic-compose/preview';
import { Compose } from './Compose';
import { Drafting } from './Drafting';
import { writeAiDraftWarnings } from './ai-draft-warnings';

interface DraftResponse {
  id: string;
  slug: string;
}

interface ApiBody {
  data?: {
    id: string;
    slug: string;
    draft: DraftPreview;
    warnings?: string[];
  };
  error?: { message: string; suggestion?: string };
}

type Phase =
  | { kind: 'idle' }
  | {
      kind: 'drafting';
      draft: DraftPreview | null;
      response: DraftResponse | null;
      animationDone: boolean;
    }
  | { kind: 'error'; message: string };

/**
 * Hard ceiling on the drafting phase. The LLM timeout is 180s server-side
 * and the animation adds ~6s. We give it generous headroom and then surface
 * an error rather than spinning forever if the response never arrives.
 */
const DRAFTING_WATCHDOG_MS = 210_000;

export function MagicComposeRoot() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [prompt, setPrompt] = useState('');
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
      setPhase({
        kind: 'error',
        message: 'AI drafting is taking longer than expected. Try again or simplify your prompt.',
      });
    }, DRAFTING_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [phase.kind]);

  const onDraft = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: 'drafting', draft: null, response: null, animationDone: false });

    try {
      const res = await fetch('/api/signups/magic-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      let body: ApiBody | null;
      try {
        body = (await res.json()) as ApiBody;
      } catch {
        if (controller.signal.aborted) return;
        setPhase({
          kind: 'error',
          message: 'The server returned an unexpected response. Try again.',
        });
        return;
      }
      if (controller.signal.aborted) return;

      const data = body?.data;
      if (!res.ok || !data?.id) {
        const base = body?.error?.message ?? `AI drafting failed (HTTP ${res.status}). Try again.`;
        const suggestion = body?.error?.suggestion;
        const message = suggestion ? `${base} — ${suggestion}` : base;
        setPhase({ kind: 'error', message });
        return;
      }

      writeAiDraftWarnings(data.id, data.warnings ?? []);

      setPhase((p) =>
        p.kind === 'drafting'
          ? {
              kind: 'drafting',
              draft: data.draft,
              response: { id: data.id, slug: data.slug },
              animationDone: p.animationDone,
            }
          : p,
      );
    } catch (e) {
      if (controller.signal.aborted) return;
      setPhase({ kind: 'error', message: explainFetchError(e) });
    }
  }, [prompt]);

  const onCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase({ kind: 'idle' });
  }, []);

  const onAnimationDone = useCallback(() => {
    setPhase((p) => (p.kind === 'drafting' ? { ...p, animationDone: true } : p));
  }, []);

  if (phase.kind === 'drafting') {
    return (
      <Drafting
        prompt={prompt}
        draft={phase.draft}
        onCancel={onCancel}
        onAnimationDone={onAnimationDone}
      />
    );
  }

  return (
    <>
      {phase.kind === 'error' && (
        <div
          role="alert"
          className="bg-danger/10 text-danger mx-auto mt-6 max-w-[760px] rounded-lg px-4 py-3 text-sm"
        >
          {phase.message}
        </div>
      )}
      <Compose prompt={prompt} setPrompt={setPrompt} onDraft={onDraft} />
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
