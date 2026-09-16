import type { CallToolResult } from '@modelcontextprotocol/server';
import { ZodError } from 'zod';
import { errorEnvelope } from '@/lib/api-response';
import { fromZodError, serviceError, ServiceException, type ServiceError } from '@/lib/errors';
import { log } from '@/lib/log';
import type { ToolContext } from './context';
import type { ToolDefinition } from './registry';

/** `structuredContent` plus the same JSON as one compact text block, which is what current clients render. */
export function toolSuccess(value: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

/**
 * The same body `api-response.ts` sends over REST, so a model that has read
 * the API docs recognises it: code, message, and the field / suggestion /
 * details that tell it what to change before retrying.
 */
export function toolFailure(error: ServiceError): CallToolResult {
  const body = errorEnvelope(error);
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(body) }], structuredContent: body };
}

/**
 * Runs one tool call end to end: the scope check, zod parse (the SDK's
 * validator only checks the JSON Schema and hands over raw arguments, so
 * defaults and transforms happen here), the handler, and the mapping of
 * every outcome to a tool result. Unknown errors are logged with the tool
 * name and returned as a generic `internal` — never a stack or a database
 * message.
 *
 * The route already turns a missing scope into the OAuth 403 challenge
 * before the SDK runs; this second check makes the registry safe on its own,
 * so any other way in (a test client, a future transport) cannot run a
 * write tool for a read-only token.
 */
export async function runTool(def: ToolDefinition, ctx: ToolContext, args: unknown): Promise<CallToolResult> {
  const started = Date.now();
  const finish = (outcome: string, result: CallToolResult) => {
    log.info(
      { tool: def.name, organizerId: ctx.actor.id, clientId: ctx.clientId, outcome, ms: Date.now() - started },
      'mcp tool call',
    );
    return result;
  };
  if (!ctx.scopes.includes(def.scope)) {
    return finish(
      'forbidden',
      toolFailure(
        serviceError('forbidden', `this tool needs the ${def.scope} permission`, {
          suggestion: 'reconnect the app and approve that permission',
          details: { requiredScope: def.scope },
        }),
      ),
    );
  }
  const parsed = def.inputSchema.safeParse(args);
  if (!parsed.success) return finish('invalid_input', toolFailure(fromZodError(parsed.error)));
  try {
    const result = await def.handler(ctx, parsed.data);
    return result.ok ? finish('ok', toolSuccess(result.value)) : finish(result.error.code, toolFailure(result.error));
  } catch (error) {
    if (error instanceof ServiceException) return finish(error.serviceError.code, toolFailure(error.serviceError));
    if (error instanceof ZodError) return finish('invalid_input', toolFailure(fromZodError(error)));
    log.error({ err: error, tool: def.name }, 'mcp tool threw');
    return finish('internal', toolFailure({ code: 'internal', message: 'something went wrong' }));
  }
}
