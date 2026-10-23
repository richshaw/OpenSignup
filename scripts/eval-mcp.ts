/**
 * MCP eval runner: what a connected assistant builds through the MCP tools.
 *
 * Runs the same cases as eval-magic-compose.ts (evals/magic-compose/dev-evals.json)
 * against a tool-calling model. The model gets the server instructions and the
 * tools as tools/list describes them, plus one organizer message; the arguments
 * of its create_signup call are scored with the same checks. A reply with no
 * create counts as a refusal, so the refusal cases still mean something. No
 * database: the read tools answer as an empty account (src/mcp/evals/assistant.ts).
 *
 * Also runs the follow-up cases in evals/mcp/followup-evals.json, where the
 * organizer says more after the first message ("add an earlier slot for
 * setup"). Those answer every tool call from the real tools against the local
 * Postgres (DATABASE_URL, as for `pnpm test:db`), and are scored on the tools
 * called, the signup's slots and the last reply (src/mcp/evals/followups.ts).
 *
 * Uses the Magic Compose settings (LLM_BASE_URL, LLM_MODEL, LLM_API_KEY,
 * LLM_TIMEOUT_MS) and the same OpenAI-compatible Chat Completions endpoint,
 * sending the tools as `tools`. A smoke signal, not a CI gate.
 *
 * Usage:
 *   pnpm eval:mcp                       # all llm cases
 *   pnpm eval:mcp --case=ev_021         # single case
 *   pnpm eval:mcp --tag=cross_product   # by tag
 *   pnpm eval:mcp --tag=follow_up       # only the follow-up cases (needs Postgres)
 *   LOG_LEVEL=warn pnpm eval:mcp        # hide the tools' per-call logs in follow-up cases
 *   pnpm eval:mcp --list                # list cases without running
 *   pnpm eval:mcp --no-snapshot         # skip writing snapshot
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import path from 'node:path';
import { getDb } from '@/db/client';
import { getEnv } from '@/lib/env';
import { resolveChatCompletionsUrl } from '@/lib/magic-compose/llm-client';
import { FullDraftSchema } from '@/lib/magic-compose/prompt';
import { err, ok } from '@/lib/result';
import { runAssistant, type AssistantMessage, type SendChat } from '@/mcp/evals/assistant';
import { scoreFollowup } from '@/mcp/evals/followup-checks';
import { runFollowupCase } from '@/mcp/evals/followups';
import { buildInstructions } from '@/mcp/instructions';
import { TOOLS } from '@/mcp/tools';
import { DEV_EVALS_FILE, runEvalCli } from './lib/eval-harness';

const INSTRUCTIONS = buildInstructions(TOOLS);

const send: SendChat = async (messages, tools) => {
  const env = getEnv();
  try {
    const res = await fetch(resolveChatCompletionsUrl(env.LLM_BASE_URL!), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LLM_API_KEY ?? 'dummy'}`,
      },
      body: JSON.stringify({ model: env.LLM_MODEL, messages, tools, temperature: 0, max_tokens: 16_000 }),
      signal: AbortSignal.timeout(env.LLM_TIMEOUT_MS),
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      return err({ code: 'upstream', message: `HTTP ${res.status}: ${body}` });
    }
    const body = (await res.json()) as { choices?: { message?: AssistantMessage }[] };
    const message = body.choices?.[0]?.message;
    if (!message) return err({ code: 'schema_mismatch', message: 'no choices[0].message in the response' });
    return ok({ role: 'assistant', content: message.content ?? null, ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}) });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'TimeoutError') {
      return err({ code: 'timeout', message: `no answer after ${env.LLM_TIMEOUT_MS}ms` });
    }
    return err({ code: 'upstream', message: e instanceof Error ? e.message : String(e) });
  }
};

runEvalCli({
  snapshotDir: path.join(process.cwd(), 'evals/mcp/snapshots'),
  schemaName: 'the create_signup input schema',
  caseFiles: [DEV_EVALS_FILE, path.join(process.cwd(), 'evals/mcp/followup-evals.json')],
  async produce(c) {
    const t0 = Date.now();
    if (c.followUps) {
      // Without Postgres only these cases fail; the single-message ones still run.
      const run = await runFollowupCase(getDb(), { prompt: c.prompt, followUps: c.followUps }, {
        send,
        tools: TOOLS,
        instructions: INSTRUCTIONS,
        now: new Date(),
      }).catch((e: unknown) => ({
        ok: false as const,
        code: 'error',
        message: e instanceof Error ? e.message : String(e),
        turns: [],
      }));
      const ms = Date.now() - t0;
      const turns = run.turns.map((t) => ({ message: t.message, ...t.outcome }));
      const trace = { toolCalls: run.turns.flatMap((t) => t.outcome.toolCalls.map((tc) => tc.name)), turns };
      if (!run.ok) return { status: 'llm_failed', code: run.code, message: run.message, ms, trace };
      return { status: 'scored', raw: run.state, checks: scoreFollowup(c.expect, run.state), ms, trace };
    }
    const out = await runAssistant(c.prompt, { send, tools: TOOLS, instructions: INSTRUCTIONS, now: new Date() });
    const ms = Date.now() - t0;
    const trace = { toolCalls: out.toolCalls, rejectedCreates: out.rejectedCreates };
    if (out.kind === 'failed') return { status: 'llm_failed', code: out.code, message: out.message, ms, trace };
    if (out.kind === 'replied') {
      return { status: 'refusal', raw: out.text, refusalReason: out.text || '(empty reply)', ms, trace };
    }
    // runAssistant already checked the arguments against create_signup's own
    // schema; this parse drops workspaceId and types the draft.
    const parsed = FullDraftSchema.safeParse(out.args);
    if (!parsed.success) return { status: 'parse_failed', raw: out.args, issues: parsed.error.issues, ms, trace };
    return { status: 'draft', raw: out.args, draft: parsed.data, ms, trace };
  },
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
