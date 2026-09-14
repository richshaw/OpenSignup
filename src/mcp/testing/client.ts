import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context';
import { registerAll, type CompiledTool } from '../registry';
import { COMPILED_TOOLS } from '../tools';

/** An MCP client wired to a server holding `ctx`, over an in-memory transport. */
export async function connectTestClient(
  ctx: ToolContext,
  tools: readonly CompiledTool[] = COMPILED_TOOLS,
): Promise<Client> {
  const server = new McpServer({ name: 'opensignup-test', version: '0.0.0' });
  registerAll(server, ctx, tools);
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  await server.connect(serverEnd);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientEnd);
  return client;
}
