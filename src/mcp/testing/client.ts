import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import type { ToolContext } from '../context';
import { buildInstructions } from '../instructions';
import { compileTools, registerAll, type ToolDefinition } from '../registry';

/**
 * An MCP client wired to a server holding `ctx`, over an in-memory
 * transport. Takes the tool list explicitly so a unit test imports only the
 * tool modules it exercises (and mocks only their services); db tests pass
 * `TOOLS` from `../tools` for the full server.
 */
export async function connectTestClient(ctx: ToolContext, tools: readonly ToolDefinition[]): Promise<Client> {
  const server = new McpServer(
    { name: 'opensignup-test', version: '0.0.0' },
    { instructions: buildInstructions(tools) },
  );
  registerAll(server, ctx, compileTools(tools));
  const [clientEnd, serverEnd] = InMemoryTransport.createLinkedPair();
  await server.connect(serverEnd);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(clientEnd);
  return client;
}
