import {
  fromJsonSchema,
  type JsonSchemaType,
  type McpServer,
  type StandardSchemaWithJSON,
} from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ServiceError } from '@/lib/errors';
import type { Result } from '@/lib/result';
import type { Scope } from '@/oauth/scopes';
import type { ToolContext } from './context';
import { runTool } from './results';

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
}

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** snake_case, stable: clients cache it. */
  name: string;
  /** The scope a token must hold to call this tool; checked by the route before the SDK runs. */
  scope: Scope;
  title: string;
  /** Written for the model: what the tool does and what it must know to call it well. */
  description: string;
  annotations: ToolAnnotations;
  /** zod 3. Arguments are camelCase and reuse the REST input schemas. */
  inputSchema: S;
  // Method syntax on purpose: a `ToolDefinition<SpecificSchema>` must be
  // assignable to `ToolDefinition<ZodTypeAny>` for the registry list, and a
  // property-typed function would make the input parameter contravariant.
  handler(ctx: ToolContext, input: z.output<S>): Promise<Result<Record<string, unknown>, ServiceError>>;
}

/** Identity function that pins the generic so `input` is typed in the handler. */
export function defineTool<S extends z.ZodTypeAny>(def: ToolDefinition<S>): ToolDefinition<S> {
  return def;
}

/**
 * zod 3 → JSON Schema for `tools/list`. `$refStrategy: 'none'` inlines
 * every reused sub-schema (clients do not resolve JSON pointers); `$schema`
 * is dropped because the SDK advertises its own dialect.
 */
export function toJsonSchema(schema: z.ZodTypeAny): JsonSchemaType {
  const { $schema: _dialect, ...rest } = zodToJsonSchema(schema, { $refStrategy: 'none' }) as Record<string, unknown>;
  return rest as JsonSchemaType;
}

export interface CompiledTool {
  def: ToolDefinition;
  input: StandardSchemaWithJSON<Record<string, unknown>, Record<string, unknown>>;
}

/**
 * Convert once. Ajv caches compiled validators by schema object identity,
 * so converting per request would add a new entry on every call.
 */
export function compileTools(tools: readonly ToolDefinition[]): CompiledTool[] {
  return tools.map((def) => ({
    def,
    input: fromJsonSchema<Record<string, unknown>>(toJsonSchema(def.inputSchema)),
  }));
}

export function registerAll(server: McpServer, ctx: ToolContext, tools: readonly CompiledTool[]): void {
  for (const { def, input } of tools) {
    server.registerTool(
      def.name,
      { title: def.title, description: def.description, inputSchema: input, annotations: def.annotations },
      async (args) => runTool(def, ctx, args),
    );
  }
}
