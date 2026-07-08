import { getEnv } from '@/lib/env';
import { log } from '@/lib/log';
import { err, ok, type Result } from '@/lib/result';
import type { ChatMessage } from './prompt';

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
  /** Seconds to wait before retrying, parsed from upstream `Retry-After`. */
  retryAfterSeconds?: number;
}

export interface LlmClient {
  generateDraft(
    messages: ChatMessage[],
    signal?: AbortSignal,
  ): Promise<Result<unknown, MagicComposeError>>;
}

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
      const timeout = setTimeout(() => timeoutController.abort(), env.LLM_TIMEOUT_MS);

      // Native since Node 20.3 (floor is 20.19 via package.json engines).
      const combinedSignal = signal
        ? AbortSignal.any([signal, timeoutController.signal])
        : timeoutController.signal;

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
            // json_object mode (not json_schema strict). Gemini's strict
            // structured outputs let it stall on the permissive `values`
            // object and pad with whitespace until token limit. The system
            // prompt with worked examples + Zod validation on the server
            // is enough; we don't need provider-side schema enforcement.
            response_format: { type: 'json_object' },
            temperature: 0,
            // Bound runaway generation. 36 slots × ~60 tokens ≈ 2.2k; cap
            // at 16k for safety on big drafts.
            max_tokens: 16_000,
          }),
          signal: combinedSignal,
        });

        if (!res.ok) {
          const status = res.status;
          const upstreamBody = await safeReadBodyText(res, 4096);
          log.warn({ status, model: env.LLM_MODEL, upstreamBody }, 'magic-compose upstream non-2xx');
          if (status === 429) {
            const retryAfterSeconds = parseRetryAfter(res.headers.get('retry-after'));
            return err({
              code: 'rate_limited',
              message: 'LLM provider rate limited the request',
              status,
              upstreamBody,
              ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
            });
          }
          if (status === 401 || status === 403) {
            return err({
              code: 'upstream',
              message: `LLM provider rejected the request (HTTP ${status}); verify LLM_API_KEY`,
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

        let rawText: string;
        try {
          rawText = await readBoundedText(res, MAX_SUCCESS_BODY_BYTES);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (timeoutController.signal.aborted) {
            return err({
              code: 'timeout',
              message: `LLM request timed out after ${env.LLM_TIMEOUT_MS}ms while reading body`,
            });
          }
          if (signal?.aborted) {
            return err({ code: 'aborted', message: 'request cancelled by caller' });
          }
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
          const truncated = JSON.stringify(body).slice(0, 500);
          log.warn({ upstreamBody: truncated }, 'magic-compose upstream missing choices[0].message.content');
          return err({
            code: 'schema_mismatch',
            message: 'LLM response did not contain choices[0].message.content',
            upstreamBody: truncated,
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

/**
 * 2 MiB cap on the success-path response body. A well-formed completion at
 * max_tokens 16k is ~80 KB; the ceiling guards against a hostile or buggy
 * provider streaming an unbounded payload into a worker's memory.
 */
const MAX_SUCCESS_BODY_BYTES = 2 * 1024 * 1024;

async function safeReadBodyText(res: Response, maxBytes: number): Promise<string> {
  try {
    const text = await readBoundedText(res, maxBytes);
    return text.slice(0, 2000);
  } catch {
    return '';
  }
}

async function readBoundedText(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) {
    const fallback = await res.text();
    return fallback.length > maxBytes ? fallback.slice(0, maxBytes) : fallback;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > maxBytes) {
        chunks.push(value.subarray(0, value.length - (total - maxBytes)));
        try {
          await reader.cancel();
        } catch {
          // best-effort
        }
        break;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // releaseLock throws if the reader was already cancelled — ignore.
    }
  }
  const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(merged);
}

/**
 * Parse a `Retry-After` header (either delta-seconds or HTTP-date) into
 * seconds-from-now. Returns undefined when the header is missing or
 * malformed; caller falls back to its own policy. Clamps to 3600s to avoid
 * a hostile provider locking us out indefinitely.
 */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const asInt = Number(trimmed);
  if (Number.isFinite(asInt) && asInt >= 0) {
    return Math.min(3600, Math.floor(asInt));
  }
  const asDate = Date.parse(trimmed);
  if (!Number.isFinite(asDate)) return undefined;
  const seconds = Math.ceil((asDate - Date.now()) / 1000);
  if (seconds <= 0) return 0;
  return Math.min(3600, seconds);
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
