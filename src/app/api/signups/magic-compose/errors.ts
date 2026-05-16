import type { ErrorCode } from '@/lib/errors';
import type { MagicComposeError } from '@/lib/magic-compose/llm-client';

/**
 * Maps the closed MagicComposeError discriminated union to the closed
 * ServiceError code enum. Lives in its own module (instead of route.ts) so
 * unit tests can import it without pulling in next-auth / NextRequest.
 */
export function mapMagicComposeError(e: MagicComposeError): {
  code: ErrorCode;
  message: string;
} {
  switch (e.code) {
    case 'not_configured':
      return { code: 'forbidden', message: 'Magic Compose is not enabled on this instance' };
    case 'rate_limited':
      return { code: 'rate_limited', message: 'LLM provider rate limited the request' };
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
    case 'invalid_json':
    case 'schema_mismatch':
      return { code: 'internal', message: 'AI drafting failed; please try again' };
  }
}
