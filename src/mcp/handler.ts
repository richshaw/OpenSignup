import {
  createMcpHandler,
  McpServer,
  type AuthInfo,
  type McpHttpHandler,
} from '@modelcontextprotocol/server';
import { shortCommit } from '@/lib/build-info';
import { log } from '@/lib/log';
import type { ToolContext } from './context';
import { buildInstructions } from './instructions';
import { registerAll } from './registry';
import { COMPILED_TOOLS, TOOLS } from './tools';

const CONTEXT_KEY = 'opensignup';
// The build's short commit, as the site footer shows it. MCP requires a
// version, so a build that didn't know its commit says 'unknown'.
const SERVER_INFO = { name: 'opensignup', version: shortCommit() ?? 'unknown' };
// Built once: the factory below runs on every request.
const INSTRUCTIONS = buildInstructions(TOOLS);

/** Rides the per-request context on the SDK's pass-through auth info. In-process only; never serialised. */
export function attachContext(authInfo: AuthInfo, ctx: ToolContext): AuthInfo {
  return { ...authInfo, extra: { ...(authInfo.extra ?? {}), [CONTEXT_KEY]: ctx } };
}

function contextFrom(authInfo?: AuthInfo): ToolContext {
  const ctx = authInfo?.extra?.[CONTEXT_KEY];
  if (!ctx) throw new Error('mcp: request reached the handler without a tool context');
  return ctx as ToolContext;
}

let handler: McpHttpHandler | null = null;

/**
 * One handler for the process. Stateless: every request gets a fresh server
 * from the factory, bound to that request's context. `maxSubscriptions: 0`
 * refuses `subscriptions/listen` streams outright — this server publishes
 * no change events, so an open stream would only hold a connection.
 */
export function getMcpHandler(): McpHttpHandler {
  if (!handler) {
    handler = createMcpHandler(
      (rc) => {
        const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
        registerAll(server, contextFrom(rc.authInfo), COMPILED_TOOLS);
        return server;
      },
      {
        legacy: 'stateless',
        maxSubscriptions: 0,
        // The SDK reports client mistakes here too (wrong Content-Type,
        // malformed JSON-RPC, a refused subscription), so this is warn, not
        // error: tool failures are logged by `runTool` with their own outcome.
        onerror: (error) => log.warn({ err: error }, 'mcp handler rejected a request'),
      },
    );
  }
  return handler;
}
