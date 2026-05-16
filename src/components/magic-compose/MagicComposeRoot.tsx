'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STARTER_PROMPTS } from '@/lib/magic-compose/templates';
import { Compose } from './Compose';
import { Drafting } from './Drafting';

type MagicComposeState =
  | { kind: 'idle' }
  | { kind: 'drafting' }
  | { kind: 'error'; message: string };

interface DraftResponse {
  id: string;
  slug: string;
}

export function MagicComposeRoot() {
  const router = useRouter();
  const [state, setState] = useState<MagicComposeState>({ kind: 'idle' });
  const [prompt, setPrompt] = useState(STARTER_PROMPTS[0]?.body ?? '');
  const [animationDone, setAnimationDone] = useState(false);
  const [response, setResponse] = useState<DraftResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Both-states-resolved redirect.
  useEffect(() => {
    if (animationDone && response && state.kind === 'drafting') {
      router.push(`/app/signups/${response.id}/build?aiDraft=1`);
    }
  }, [animationDone, response, state.kind, router]);

  const onDraft = useCallback(async () => {
    if (!prompt.trim()) return;
    const trimmed = prompt.trim();

    setAnimationDone(false);
    setResponse(null);
    setState({ kind: 'drafting' });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/signups/magic-compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const body = (await res.json().catch(() => null)) as
        | {
            data?: { id: string; slug: string };
            error?: { message: string; suggestion?: string };
          }
        | null;
      if (controller.signal.aborted) return;
      if (!res.ok || !body?.data?.id) {
        const base = body?.error?.message ?? `AI drafting failed (HTTP ${res.status}). Try again.`;
        const suggestion = body?.error?.suggestion;
        const message = suggestion ? `${base} — ${suggestion}` : base;
        setState({ kind: 'error', message });
        return;
      }
      setResponse({ id: body.data.id, slug: body.data.slug });
    } catch (e) {
      if (controller.signal.aborted) return; // cancel path handled separately
      const message = e instanceof Error ? e.message : 'Network error';
      setState({ kind: 'error', message });
    }
  }, [prompt]);

  const onCancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnimationDone(false);
    setResponse(null);
    setState({ kind: 'idle' });
  }, []);

  const onAnimationDone = useCallback(() => setAnimationDone(true), []);

  if (state.kind === 'drafting') {
    return <Drafting prompt={prompt} onCancel={onCancel} onAnimationDone={onAnimationDone} />;
  }

  return (
    <>
      {state.kind === 'error' && (
        <div
          role="alert"
          className="bg-danger/10 text-danger mx-auto mt-6 max-w-[760px] rounded-lg px-4 py-3 text-sm"
        >
          {state.message}
        </div>
      )}
      <Compose prompt={prompt} setPrompt={setPrompt} onDraft={onDraft} />
    </>
  );
}
