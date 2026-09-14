import type { Scope } from '@/oauth/scopes';
import { compileTools, type CompiledTool, type ToolDefinition } from '../registry';
import { getSignup, listSignups } from './signups-read';
import {
  archiveSignupTool,
  closeSignupTool,
  createSignupTool,
  deleteSignupTool,
  publishSignupTool,
  updateSignupTool,
} from './signups-write';
import { listWorkspaces } from './workspaces';

/** Every tool the server exposes, in the order `tools/list` returns them. */
export const TOOLS: readonly ToolDefinition[] = [
  listWorkspaces,
  listSignups,
  getSignup,
  createSignupTool,
  updateSignupTool,
  publishSignupTool,
  closeSignupTool,
  archiveSignupTool,
  deleteSignupTool,
];

/** Converted once; see `compileTools`. */
export const COMPILED_TOOLS: readonly CompiledTool[] = compileTools(TOOLS);

const SCOPE_BY_NAME = new Map(TOOLS.map((t) => [t.name, t.scope]));

export function toolScope(name: string): Scope | null {
  return SCOPE_BY_NAME.get(name) ?? null;
}
