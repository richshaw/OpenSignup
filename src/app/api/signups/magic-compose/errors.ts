import type { ErrorCode } from '@/lib/errors';
import type { MagicComposeError } from '@/lib/magic-compose/llm-client';

export interface MappedMagicComposeError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function mapMagicComposeError(e: MagicComposeError): MappedMagicComposeError {
  switch (e.code) {
    case 'not_configured':
      return { code: 'forbidden', message: 'Magic Compose is not enabled on this instance' };
    case 'rate_limited': {
      const details: Record<string, unknown> = {};
      if (typeof e.retryAfterSeconds === 'number') {
        details.retryAfterSeconds = e.retryAfterSeconds;
      }
      return {
        code: 'rate_limited',
        message:
          typeof e.retryAfterSeconds === 'number'
            ? `AI provider is rate limiting requests. Try again in ${e.retryAfterSeconds}s.`
            : 'AI provider is rate limiting requests. Try again shortly.',
        ...(Object.keys(details).length > 0 ? { details } : {}),
      };
    }
    case 'aborted':
      // Client closed the connection; the response is dropped anyway. Code
      // matters for log/Sentry classification — not a user input error.
      return { code: 'internal', message: 'request cancelled' };
    case 'timeout':
      return {
        code: 'internal',
        message: 'AI drafting timed out. Try a simpler prompt or raise LLM_TIMEOUT_MS.',
      };
    case 'upstream':
      if (e.status === 401 || e.status === 403) {
        return {
          code: 'internal',
          message:
            'AI provider rejected the API key. An operator needs to check LLM_API_KEY.',
        };
      }
      if (e.status !== undefined && e.status >= 500) {
        return {
          code: 'internal',
          message: `AI provider is unavailable right now (HTTP ${e.status}). Try again.`,
        };
      }
      return {
        code: 'internal',
        message: `AI provider returned an error${e.status !== undefined ? ` (HTTP ${e.status})` : ''}. Try again.`,
      };
    case 'invalid_json':
      return {
        code: 'internal',
        message: 'AI provider returned a malformed response. Try again.',
      };
    case 'schema_mismatch':
      return {
        code: 'internal',
        message: 'AI provider returned an unexpected response shape. Try again.',
      };
  }
}
