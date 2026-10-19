/**
 * Magic Compose eval runner.
 *
 * Loads evals/magic-compose/dev-evals.json, calls the live LLM via
 * defaultLlmClient() for each `runner: "llm"` case, validates with the
 * production Zod schema, and interprets the eval DSL. Prints per-case
 * pass/fail and writes a snapshot to evals/magic-compose/snapshots/.
 *
 * Usage:
 *   pnpm eval:magic-compose                       # all llm cases
 *   pnpm eval:magic-compose --case=ev_021         # single case
 *   pnpm eval:magic-compose --tag=cross_product   # by tag
 *   pnpm eval:magic-compose --list                # list cases without running
 *   pnpm eval:magic-compose --no-snapshot         # skip writing snapshot
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import path from 'node:path';
import { defaultLlmClient } from '@/lib/magic-compose/llm-client';
import { buildMessages, MagicComposeDraftSchema, type MagicComposeParsed } from '@/lib/magic-compose/prompt';
import { runEvalCli } from './lib/eval-harness';

function isRefusal(p: MagicComposeParsed): p is { refusalReason: string } {
  return 'refusalReason' in p && typeof p.refusalReason === 'string';
}

runEvalCli({
  snapshotDir: path.join(process.cwd(), 'evals/magic-compose/snapshots'),
  schemaName: 'MagicComposeDraftSchema',
  async produce(c) {
    const client = defaultLlmClient();
    const t0 = Date.now();
    const res = await client.generateDraft(buildMessages(c.prompt));
    const ms = Date.now() - t0;
    if (!res.ok) return { status: 'llm_failed', code: res.error.code, message: res.error.message, ms };

    const parsed = MagicComposeDraftSchema.safeParse(res.value);
    if (!parsed.success) return { status: 'parse_failed', raw: res.value, issues: parsed.error.issues, ms };
    if (isRefusal(parsed.data)) {
      return { status: 'refusal', raw: res.value, refusalReason: parsed.data.refusalReason, ms };
    }
    return { status: 'draft', raw: res.value, draft: parsed.data, ms };
  },
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
