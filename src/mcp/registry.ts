import {
  fromJsonSchema,
  type JsonSchemaType,
  type JsonSchemaValidator,
  type jsonSchemaValidator,
  type McpServer,
  type StandardSchemaWithJSON,
  type ToolAnnotations,
} from '@modelcontextprotocol/server';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ServiceError } from '@/lib/errors';
import type { Result } from '@/lib/result';
import type { Scope } from '@/oauth/scopes';
import type { ToolContext } from './context';
import { runTool } from './results';

/**
 * Every tool states both hints outright. The Claude connectors directory
 * rejects a tool without them, and the MCP spec reads a missing
 * `destructiveHint` as true and a missing `readOnlyHint` as false, so
 * leaving one out says something we may not mean. `destructiveHint` is true
 * for anything that overwrites or removes data or changes who can see it,
 * and false only for purely additive writes. `title` is not here: it comes
 * from the tool's own `title`.
 */
export type ToolHints = Omit<ToolAnnotations, 'title' | 'readOnlyHint' | 'destructiveHint'> &
  ({ readOnlyHint: true; destructiveHint?: never } | { readOnlyHint: false; destructiveHint: boolean });

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** snake_case, stable: clients cache it. */
  name: string;
  /** The scope a token must hold to call this tool; checked by the route before the SDK runs. */
  scope: Scope;
  title: string;
  /** Written for the model: what the tool does and what it must know to call it well. */
  description: string;
  annotations: ToolHints;
  /**
   * Named in the server instructions as a tool to ask the organizer about
   * before calling. Kept apart from `destructiveHint`, which also covers
   * plain updates that the organizer asked for in the first place.
   */
  askFirst?: true;
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
  /** The `registerTool` config, built once so a request only allocates the callback. */
  config: {
    title: string;
    description: string;
    inputSchema: StandardSchemaWithJSON<Record<string, unknown>, Record<string, unknown>>;
    annotations: ToolAnnotations;
  };
}

/**
 * Accepts anything. The JSON Schema is advertised to clients as-is, but the
 * SDK's own Ajv check is switched off so that `runTool` and the zod schema
 * do every bit of validation: one pass, and every input mistake comes back
 * in the same structured `invalid_input` shape with a field and a
 * suggestion, instead of Ajv's plain-text message for some and ours for
 * the rest.
 */
const zodDoesTheValidating: jsonSchemaValidator = {
  getValidator<T>(): JsonSchemaValidator<T> {
    return (input) => ({ valid: true, data: input as T, errorMessage: undefined });
  },
};

/** Convert once at module load; the result is bound to a context per request in `registerAll`. */
export function compileTools(tools: readonly ToolDefinition[]): CompiledTool[] {
  return tools.map((def) => ({
    def,
    config: {
      title: def.title,
      description: def.description,
      inputSchema: fromJsonSchema<Record<string, unknown>>(toJsonSchema(def.inputSchema), zodDoesTheValidating),
      // `title` repeated for clients that only read it from the annotations.
      // Closed world: every tool acts on this service's own data only.
      annotations: { title: def.title, openWorldHint: false, ...def.annotations },
    },
  }));
}

export function registerAll(server: McpServer, ctx: ToolContext, tools: readonly CompiledTool[]): void {
  for (const { def, config } of tools) {
    server.registerTool(def.name, config, async (args) => runTool(def, ctx, args));
  }
}
