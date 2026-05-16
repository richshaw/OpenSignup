import { getEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { err, ok, type Result } from '@/lib/result';
import { RESPONSE_JSON_SCHEMA, type ChatMessage } from './prompt';

export type MagicComposeErrorCode =
  | 'not_configured'
  | 'rate_limited'
  | 'upstream'
  | 'invalid_json'
  | 'schema_mismatch'
  | 'timeout'
  | 'aborted';

export interface MagicComposeError {
  code: MagicComposeErrorCode;
  message: string;
  status?: number;
  /** First ~500 chars of the upstream response body, for debugging. */
  upstreamBody?: string;
}

export interface LlmClient {
  generateDraft(
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<Result<unknown, MagicComposeError>>;
}

const DEFAULT_TIMEOUT_MS = 60_000;

export function defaultLlmClient(): LlmClient {
  return {
    async generateDraft(messages, signal) {
      const env = getEnv();
      if (!env.LLM_BASE_URL || !env.LLM_MODEL) {
        return err({
          code: 'not_configured',
          message: 'Magic Compose is not configured on this instance',
        });
      }

      const url = resolveChatCompletionsUrl(env.LLM_BASE_URL);
      const timeoutController = new AbortController();
      const timeout = setTimeout(() => timeoutController.abort(), DEFAULT_TIMEOUT_MS);

      const combinedSignal = anySignal([signal, timeoutController.signal]);

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${env.LLM_API_KEY ?? 'dummy'}`,
          },
          body: JSON.stringify({
            model: env.LLM_MODEL,
            messages,
            response_format: { type: 'json_schema', json_schema: RESPONSE_JSON_SCHEMA },
            temperature: 0.2,
          }),
          signal: combinedSignal,
        });

        if (!res.ok) {
          const status = res.status;
          const upstreamBody = await safeReadBodyText(res);
          log.warn({ status, model: env.LLM_MODEL, upstreamBody }, 'magic-compose upstream non-2xx');
          if (status === 429) {
            return err({
              code: 'rate_limited',
              message: 'LLM provider rate limited the request',
              status,
              upstreamBody,
            });
          }
          return err({
            code: 'upstream',
            message: `LLM provider returned HTTP ${status}`,
            status,
            upstreamBody,
          });
        }

        let rawText = '';
        try {
          rawText = await res.text();
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return err({ code: 'upstream', message: `failed to read response body: ${msg}` });
        }
        let body: unknown;
        try {
          body = JSON.parse(rawText);
        } catch {
          const sample = rawText.slice(0, 2000);
          log.warn({ upstreamBody: sample }, 'magic-compose upstream returned non-JSON');
          return err({
            code: 'invalid_json',
            message: 'LLM response was not JSON',
            upstreamBody: sample,
          });
        }

        const content = extractChoiceContent(body);
        if (content === null) {
          log.warn({ body }, 'magic-compose upstream missing choices[0].message.content');
          return err({
            code: 'schema_mismatch',
            message: 'LLM response did not contain choices[0].message.content',
            upstreamBody: JSON.stringify(body).slice(0, 500),
          });
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(stripCodeFence(content));
        } catch {
          log.warn({ content }, 'magic-compose model content was not valid JSON');
          return err({
            code: 'invalid_json',
            message: 'LLM message content was not valid JSON',
            upstreamBody: content.slice(0, 500),
          });
        }

        return ok(parsed);
      } catch (e) {
        if (signal?.aborted) {
          return err({ code: 'aborted', message: 'request cancelled by caller' });
        }
        if (timeoutController.signal.aborted) {
          return err({ code: 'timeout', message: 'LLM request timed out' });
        }
        const message = e instanceof Error ? e.message : String(e);
        return err({ code: 'upstream', message });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

/**
 * Resolves the chat completions URL. Accepts either a bare base
 * (`https://openrouter.ai/api/v1`) or the full endpoint
 * (`https://openrouter.ai/api/v1/chat/completions`) so operators can paste
 * either form into LLM_BASE_URL. Matches the OpenAI SDK's behaviour.
 */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  if (/\/chat\/completions$/.test(trimmed)) return trimmed;
  return `${trimmed}/chat/completions`;
}

async function safeReadBodyText(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 2000);
  } catch {
    return '';
  }
}

function stripCodeFence(s: string): string {
  // Some models wrap JSON output in ```json ... ``` despite instructions.
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1]! : s;
}

function extractChoiceContent(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!first || typeof first !== 'object') return null;
  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== 'object') return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' ? content : null;
}

function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}
