/**
 * Magic Compose eval runner.
 *
 * Loads evals/magic-compose/dev-evals.json, calls the live LLM via
 * defaultLlmClient() for each `runner: "llm"` case, validates with the
 * production Zod schema, and interprets the eval DSL. Prints per-case
 * pass/fail and writes a snapshot to evals/magic-compose/snapshots/.
 *
 * A reply can be a draft, a refusal or questions. A case with `answers` runs
 * both calls the page makes: the prompt, which must ask, then the prompt with
 * the answers (`buildFollowUpMessages`), whose draft is scored. A reply to the
 * answers that asks again, in any shape, is `asked_again`, as the route reads
 * it.
 *
 * Usage:
 *   pnpm eval:magic-compose                       # all llm cases
 *   pnpm eval:magic-compose --case=ev_021         # single case
 *   pnpm eval:magic-compose --tag=cross_product   # by tag
 *   pnpm eval:magic-compose --tag=questions       # the cases about asking
 *   pnpm eval:magic-compose --list                # list cases without running
 *   pnpm eval:magic-compose --no-snapshot         # skip writing snapshot
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import path from 'node:path';
import { buildFollowUpMessages } from '@/lib/magic-compose/follow-up';
import { defaultLlmClient } from '@/lib/magic-compose/llm-client';
import {
  asksQuestions,
  buildMessages,
  isQuestionsReply,
  MagicComposeDraftSchema,
  type ChatMessage,
  type MagicComposeParsed,
} from '@/lib/magic-compose/prompt';
import { runEvalCli, type Produced } from './lib/eval-harness';

function isRefusal(p: MagicComposeParsed): p is { refusalReason: string } {
  return 'refusalReason' in p && typeof p.refusalReason === 'string';
}

/**
 * One call to the model, read the way the route reads it. After the answers,
 * a reply that asks questions in any shape is asked again before the schema
 * sees it, so a partial re-ask (only "when", with no options) isn't scored as
 * a broken draft.
 */
async function ask(
  messages: ChatMessage[],
  { afterAnswers = false }: { afterAnswers?: boolean } = {},
): Promise<Produced> {
  const client = defaultLlmClient();
  const t0 = Date.now();
  const res = await client.generateDraft(messages);
  const ms = Date.now() - t0;
  if (!res.ok) {
    return { status: 'llm_failed', code: res.error.code, message: res.error.message, ms };
  }
  if (afterAnswers && asksQuestions(res.value)) {
    return { status: 'asked_again', raw: res.value, ms };
  }

  const parsed = MagicComposeDraftSchema.safeParse(res.value);
  if (!parsed.success) {
    return { status: 'parse_failed', raw: res.value, issues: parsed.error.issues, ms };
  }
  if (isQuestionsReply(parsed.data)) {
    return { status: 'questions', raw: res.value, questions: parsed.data.questions, ms };
  }
  if (isRefusal(parsed.data)) {
    return { status: 'refusal', raw: res.value, refusalReason: parsed.data.refusalReason, ms };
  }
  return { status: 'draft', raw: res.value, draft: parsed.data, ms };
}

runEvalCli({
  snapshotDir: path.join(process.cwd(), 'evals/magic-compose/snapshots'),
  schemaName: 'MagicComposeDraftSchema',
  produce: (c) => ask(buildMessages(c.prompt)),
  // The harness has checked the answers with FollowUpSchema before either call.
  answer: (c, answers) => ask(buildFollowUpMessages(c.prompt, answers), { afterAnswers: true }),
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
