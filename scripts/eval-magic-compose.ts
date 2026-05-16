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

import fs from 'node:fs/promises';
import path from 'node:path';
import { defaultLlmClient } from '@/lib/magic-compose/llm-client';
import { buildMessages, MagicComposeDraftSchema, type MagicComposeDraft } from '@/lib/magic-compose/prompt';
import { magicComposeEnabled } from '@/lib/env';

const REPO_ROOT = process.cwd();
const EVAL_FILE = path.join(REPO_ROOT, 'evals/magic-compose/dev-evals.json');
const SNAPSHOT_DIR = path.join(REPO_ROOT, 'evals/magic-compose/snapshots');

type Runner = 'llm' | 'server';
interface EvalCase {
  id: string;
  tags: string[];
  runner: Runner;
  prompt: string;
  expect: Record<string, unknown>;
}

type Outcome = 'pass' | 'fail' | 'skip';
interface CheckResult {
  key: string;
  outcome: Outcome;
  detail?: string;
}

interface CaseRun {
  caseId: string;
  runner: Runner;
  tags: string[];
  prompt: string;
  status: 'ok' | 'parse_failed' | 'llm_failed' | 'skipped';
  llmErrorCode?: string;
  llmErrorMessage?: string;
  rawOutput?: unknown;
  draft?: MagicComposeDraft;
  checks: CheckResult[];
  tokens?: { ms: number };
}

function parseArgs(argv: string[]): {
  caseId?: string;
  tag?: string;
  list: boolean;
  noSnapshot: boolean;
} {
  const args: ReturnType<typeof parseArgs> = { list: false, noSnapshot: false };
  for (const a of argv) {
    if (a === '--list') args.list = true;
    else if (a === '--no-snapshot') args.noSnapshot = true;
    else if (a.startsWith('--case=')) args.caseId = a.slice('--case='.length);
    else if (a.startsWith('--tag=')) args.tag = a.slice('--tag='.length);
  }
  return args;
}

async function loadCases(): Promise<EvalCase[]> {
  const raw = await fs.readFile(EVAL_FILE, 'utf-8');
  const parsed = JSON.parse(raw) as { cases: EvalCase[] };
  return parsed.cases;
}

function filterCases(
  cases: EvalCase[],
  opts: { caseId?: string; tag?: string },
): EvalCase[] {
  return cases.filter((c) => {
    if (opts.caseId && c.id !== opts.caseId) return false;
    if (opts.tag && !c.tags.includes(opts.tag)) return false;
    return true;
  });
}

// ── DSL interpreter ────────────────────────────────────────────────────────

function lower(s: string): string {
  return s.toLowerCase();
}

/**
 * Loose label match: lowercase + collapse non-alphanumerics to single spaces.
 * Lets "Face-Painting Booth" match needle "face paint". Don't use this for
 * date checks — dates legitimately contain hyphens.
 */
function loose(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function looseIncludes(haystack: string, needle: string): boolean {
  return loose(haystack).includes(loose(needle));
}

function dateValues(draft: MagicComposeDraft): string[] {
  const dateRefs = draft.fields.filter((f) => f.fieldType === 'date').map((f) => f.ref);
  const out: string[] = [];
  for (const slot of draft.slots) {
    for (const ref of dateRefs) {
      const v = slot.values[ref];
      if (typeof v === 'string') out.push(v);
    }
  }
  return out;
}

function slotValuesText(draft: MagicComposeDraft): string {
  return draft.slots
    .map((s) => Object.values(s.values).map((v) => String(v)).join(' '))
    .join(' ')
    .toLowerCase();
}

function fullText(draft: MagicComposeDraft): string {
  const fieldText = draft.fields.map((f) => `${f.ref} ${f.label}`).join(' ');
  return [draft.title, draft.description, fieldText, slotValuesText(draft)].join(' ').toLowerCase();
}

function fail(key: string, detail: string): CheckResult {
  return { key, outcome: 'fail', detail };
}
function pass(key: string): CheckResult {
  return { key, outcome: 'pass' };
}
function skip(key: string, reason: string): CheckResult {
  return { key, outcome: 'skip', detail: reason };
}

function normalizeKey(key: string): string {
  // Eval JSON disambiguates repeated checks with .b/.c suffixes since JSON
  // can't have duplicate keys. Strip the suffix so the dispatcher matches.
  return key.replace(/\.[a-z]$/, '');
}

function runCheck(
  rawKey: string,
  expected: unknown,
  draft: MagicComposeDraft,
  rawOutput: unknown,
): CheckResult {
  const key = normalizeKey(rawKey);
  const arr = (v: unknown): string[] | null =>
    Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  switch (key) {
    case 'title_must_match_any': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      return a.some((s) => looseIncludes(draft.title, s))
        ? pass(rawKey)
        : fail(rawKey, `title "${draft.title}" matches none of ${JSON.stringify(a)}`);
    }
    case 'title_must_not_be_pure_ascii_english': {
      const hasNonAscii = /[^\x00-\x7F]/.test(draft.title);
      return hasNonAscii
        ? pass(rawKey)
        : fail(rawKey, `title "${draft.title}" looks pure ASCII (heuristic)`);
    }

    case 'fields.count_range': {
      const a = expected as unknown[];
      if (!Array.isArray(a) || a.length !== 2) return skip(rawKey, 'expected [min,max]');
      const [min, max] = a as [number, number];
      const n = draft.fields.length;
      return n >= min && n <= max
        ? pass(rawKey)
        : fail(rawKey, `fields.length=${n} not in [${min},${max}]`);
    }
    case 'fields.field_types_subset_of': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const bad = draft.fields.filter((f) => !a.includes(f.fieldType));
      return bad.length === 0
        ? pass(rawKey)
        : fail(rawKey, `fieldTypes outside ${JSON.stringify(a)}: ${bad.map((f) => f.fieldType).join(',')}`);
    }
    case 'fields.must_include_field_type': {
      const t = typeof expected === 'string' ? expected : null;
      if (!t) return skip(rawKey, 'expected string');
      return draft.fields.some((f) => f.fieldType === t)
        ? pass(rawKey)
        : fail(rawKey, `no field with fieldType="${t}"`);
    }
    case 'fields.must_not_include_field_type': {
      const t = typeof expected === 'string' ? expected : null;
      if (!t) return skip(rawKey, 'expected string');
      return draft.fields.every((f) => f.fieldType !== t)
        ? pass(rawKey)
        : fail(rawKey, `found field with fieldType="${t}"`);
    }
    case 'fields.must_include_enum_with_choices': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const wanted = a.map(lower);
      const ok = draft.fields.some((f) => {
        if (f.fieldType !== 'enum' || !f.choices) return false;
        const have = f.choices.map(lower);
        return wanted.every((w) => have.includes(w));
      });
      return ok
        ? pass(rawKey)
        : fail(rawKey, `no enum field whose choices include all of ${JSON.stringify(a)}`);
    }
    case 'fields.refs_must_not_match_any':
    case 'fields.labels_must_not_match_any': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const pick = key === 'fields.refs_must_not_match_any'
        ? (f: { ref: string }) => f.ref
        : (f: { label: string }) => f.label;
      const haystack = draft.fields.map(pick);
      const hits: string[] = [];
      for (const needle of a) {
        if (haystack.some((h) => looseIncludes(h, needle))) hits.push(needle);
      }
      return hits.length === 0
        ? pass(rawKey)
        : fail(rawKey, `matched forbidden patterns: ${hits.join(', ')}`);
    }

    case 'slots.count': {
      const n = num(expected);
      if (n === null) return skip(rawKey, 'expected number');
      return draft.slots.length === n
        ? pass(rawKey)
        : fail(rawKey, `slots.length=${draft.slots.length} ≠ ${n}`);
    }
    case 'slots.count_range': {
      const a = expected as unknown[];
      if (!Array.isArray(a) || a.length !== 2) return skip(rawKey, 'expected [min,max]');
      const [min, max] = a as [number, number];
      const n = draft.slots.length;
      return n >= min && n <= max
        ? pass(rawKey)
        : fail(rawKey, `slots.length=${n} not in [${min},${max}]`);
    }
    case 'slots.all_capacities_equal': {
      const n = num(expected);
      if (n === null) return skip(rawKey, 'expected number');
      const bad = draft.slots.filter((s) => s.capacity !== n);
      return bad.length === 0
        ? pass(rawKey)
        : fail(rawKey, `${bad.length}/${draft.slots.length} slots have capacity≠${n}`);
    }
    case 'slot[0].capacity': {
      const n = num(expected);
      if (n === null) return skip(rawKey, 'expected number');
      const cap = draft.slots[0]?.capacity;
      return cap === n
        ? pass(rawKey)
        : fail(rawKey, `slots[0].capacity=${cap} ≠ ${n}`);
    }

    case 'every_slot.values_non_empty': {
      if (expected !== true) return skip(rawKey, 'expected true');
      const empty = draft.slots.findIndex((s) => Object.keys(s.values).length === 0);
      return empty === -1
        ? pass(rawKey)
        : fail(rawKey, `slot[${empty}].values is empty`);
    }
    case 'every_slot.values_keys_must_match_declared_field_refs': {
      if (expected !== true) return skip(rawKey, 'expected true');
      const refs = new Set(draft.fields.map((f) => f.ref));
      for (let i = 0; i < draft.slots.length; i++) {
        const slot = draft.slots[i]!;
        for (const k of Object.keys(slot.values)) {
          if (!refs.has(k)) return fail(rawKey, `slot[${i}] has unknown key "${k}"`);
        }
      }
      return pass(rawKey);
    }

    case 'slot_dates.must_include_any': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const dates = dateValues(draft);
      return a.some((d) => dates.includes(d))
        ? pass(rawKey)
        : fail(rawKey, `none of ${JSON.stringify(a)} in slot dates ${JSON.stringify(dates)}`);
    }
    case 'slot_dates.must_exclude': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const dates = dateValues(draft);
      const hits = a.filter((d) => dates.includes(d));
      return hits.length === 0
        ? pass(rawKey)
        : fail(rawKey, `excluded dates appeared: ${hits.join(', ')}`);
    }
    case 'slot_dates.set_must_equal': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const got = [...new Set(dateValues(draft))].sort();
      const want = [...a].sort();
      return JSON.stringify(got) === JSON.stringify(want)
        ? pass(rawKey)
        : fail(rawKey, `dates set ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
    }

    case 'slot_values_must_cover_any': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const hay = slotValuesText(draft);
      const missing = a.filter((s) => !looseIncludes(hay, s));
      return missing.length === 0
        ? pass(rawKey)
        : fail(rawKey, `slot values cover none of: ${missing.join(', ')}`);
    }
    case 'slot_values_or_description_must_mention_any': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const hay = slotValuesText(draft) + ' ' + draft.description;
      return a.some((s) => looseIncludes(hay, s))
        ? pass(rawKey)
        : fail(rawKey, `none of ${JSON.stringify(a)} in slot values or description`);
    }
    case 'slot_times_or_description_must_mention':
    case 'slot_times_or_labels.must_include_starts':
    case 'description_or_field_must_mention_any':
    case 'description_or_field_must_mention':
    case 'description_or_slot_must_mention_date_in':
    case 'slot_dates_or_description_must_mention': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const hay = fullText(draft);
      const missing = a.filter((s) => !looseIncludes(hay, s));
      // For "must_include_starts" semantics, all must hit. For others, any.
      const requireAll = key === 'slot_times_or_labels.must_include_starts';
      if (requireAll) {
        return missing.length === 0
          ? pass(rawKey)
          : fail(rawKey, `missing: ${missing.join(', ')}`);
      }
      return missing.length < a.length
        ? pass(rawKey)
        : fail(rawKey, `none of ${JSON.stringify(a)} appeared anywhere in the draft`);
    }
    case 'description_should_mention_conflict_any': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      return a.some((s) => looseIncludes(draft.description, s))
        ? pass(rawKey)
        : fail(rawKey, `description mentions no conflict word from ${JSON.stringify(a)}`);
    }

    case 'groupBy_should_be_null': {
      if (expected !== true) return skip(rawKey, 'expected true');
      return !draft.groupBy
        ? pass(rawKey)
        : fail(rawKey, `groupBy="${draft.groupBy}" but expected null`);
    }
    case 'groupBy_must_reference_field_with_choices_subset_of': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      if (!draft.groupBy) return fail(rawKey, 'groupBy is null/undefined');
      const f = draft.fields.find((x) => x.ref === draft.groupBy);
      if (!f) return fail(rawKey, `groupBy ref "${draft.groupBy}" has no matching field`);
      if (!f.choices) return fail(rawKey, `field "${draft.groupBy}" has no choices`);
      const want = new Set(a.map(lower));
      const stray = f.choices.filter((c) => !want.has(lower(c)));
      return stray.length === 0
        ? pass(rawKey)
        : fail(rawKey, `choices include extras outside ${JSON.stringify(a)}: ${stray.join(', ')}`);
    }
    case 'groupBy_or_converter_fallback_must_reference_enum_field': {
      if (expected !== true) return skip(rawKey, 'expected true');
      const enums = draft.fields.filter((f) => f.fieldType === 'enum');
      if (draft.groupBy) {
        const f = draft.fields.find((x) => x.ref === draft.groupBy);
        if (f && f.fieldType === 'enum') return pass(rawKey);
      }
      // Fallback simulated: converter picks sole enum if only one
      if (enums.length === 1) return pass(rawKey);
      return fail(
        rawKey,
        `groupBy=${draft.groupBy ?? 'null'}, ${enums.length} enum fields — converter would not pick one`,
      );
    }

    case 'raw_output_must_not_match_patterns': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const s = JSON.stringify(rawOutput);
      const hits = a.filter((p) => new RegExp(p).test(s));
      return hits.length === 0
        ? pass(rawKey)
        : fail(rawKey, `output matched: ${hits.join(', ')}`);
    }
    case 'must_not_exceed_limits': {
      const v = expected as { max_fields?: number; max_slots?: number };
      if (typeof v?.max_fields === 'number' && draft.fields.length > v.max_fields) {
        return fail(rawKey, `fields ${draft.fields.length} > ${v.max_fields}`);
      }
      if (typeof v?.max_slots === 'number' && draft.slots.length > v.max_slots) {
        return fail(rawKey, `slots ${draft.slots.length} > ${v.max_slots}`);
      }
      return pass(rawKey);
    }

    case 'slot_labels.must_cover_any_of_each': {
      const a = expected as unknown;
      if (!Array.isArray(a) || !a.every((g) => Array.isArray(g))) {
        return skip(rawKey, 'expected string[][]');
      }
      const groups = a as string[][];
      const hay = slotValuesText(draft);
      const missing: string[][] = [];
      for (const g of groups) {
        if (!g.some((s) => looseIncludes(hay, s))) missing.push(g);
      }
      return missing.length === 0
        ? pass(rawKey)
        : fail(rawKey, `no slot covered any of: ${missing.map((g) => JSON.stringify(g)).join('; ')}`);
    }

    case 'fields.must_not_capture_any': {
      const a = arr(expected);
      if (!a) return skip(rawKey, 'expected string[]');
      const hay = draft.fields.map((f) => `${f.ref} ${f.label}`).join(' ');
      const hits = a.filter((s) => looseIncludes(hay, s));
      return hits.length === 0
        ? pass(rawKey)
        : fail(rawKey, `fields capture forbidden: ${hits.join(', ')}`);
    }

    case 'slots.any_capacity_equals_or_sums_to': {
      const n = num(expected);
      if (n === null) return skip(rawKey, 'expected number');
      const caps = draft.slots.map((s) => s.capacity ?? 0);
      const sum = caps.reduce((a2, b) => a2 + b, 0);
      return caps.includes(n) || sum === n
        ? pass(rawKey)
        : fail(rawKey, `no slot capacity equals ${n} and sum=${sum}`);
    }

    case 'slots.capacity_for_label': {
      const a = expected as Array<{ label_match: string; capacity: number }> | undefined;
      if (!Array.isArray(a)) return skip(rawKey, 'expected array');
      for (const req of a) {
        const match = draft.slots.find((s) =>
          looseIncludes(JSON.stringify(s.values), req.label_match),
        );
        if (!match) return fail(rawKey, `no slot values include "${req.label_match}"`);
        if (match.capacity !== req.capacity) {
          return fail(rawKey, `slot for "${req.label_match}" cap=${match.capacity} ≠ ${req.capacity}`);
        }
      }
      return pass(rawKey);
    }

    case 'must_express_target_via_one_of': {
      const opts = expected as Array<{
        strategy: 'capacity' | 'number_field';
        label_match?: string;
        value?: number;
        values?: number[];
        field_ref_must_match_any?: string[];
      }>;
      if (!Array.isArray(opts)) return skip(rawKey, 'expected array');
      for (const opt of opts) {
        if (opt.strategy === 'capacity') {
          if (opt.value !== undefined && opt.label_match) {
            const match = draft.slots.find((s) =>
              looseIncludes(JSON.stringify(s.values), opt.label_match!),
            );
            if (match && match.capacity === opt.value) return pass(rawKey);
          } else if (opt.values) {
            const caps = draft.slots.map((s) => s.capacity).filter((c): c is number => c !== null);
            if (opt.values.every((v) => caps.includes(v))) return pass(rawKey);
          }
        } else if (opt.strategy === 'number_field') {
          const numFields = draft.fields.filter((f) => f.fieldType === 'number');
          if (numFields.length === 0) continue;
          if (opt.field_ref_must_match_any) {
            const refOk = numFields.some((f) =>
              opt.field_ref_must_match_any!.some((p) => lower(f.ref).includes(lower(p))),
            );
            if (!refOk) continue;
          }
          if (opt.values) {
            const values: number[] = [];
            for (const s of draft.slots) {
              for (const f of numFields) {
                const v = s.values[f.ref];
                if (typeof v === 'number') values.push(v);
              }
            }
            if (opt.values.every((v) => values.includes(v))) return pass(rawKey);
          } else if (opt.value !== undefined && opt.label_match) {
            const match = draft.slots.find((s) =>
              looseIncludes(JSON.stringify(s.values), opt.label_match!),
            );
            if (match) {
              for (const f of numFields) {
                if (match.values[f.ref] === opt.value) return pass(rawKey);
              }
            }
          }
        }
      }
      return fail(rawKey, 'no strategy in must_express_target_via_one_of matched');
    }

    case 'must_not_invent':
    case 'behavior':
    case 'behavior_options':
    case 'rationale':
    case 'robustness':
      return skip(rawKey, 'prose-only — not machine-checkable');

    default:
      return skip(rawKey, `unsupported key (extend runner if you need it)`);
  }
}

async function runOneCase(c: EvalCase): Promise<CaseRun> {
  const base: CaseRun = {
    caseId: c.id,
    runner: c.runner,
    tags: c.tags,
    prompt: c.prompt,
    status: 'ok',
    checks: [],
  };

  if (c.runner === 'server') {
    return {
      ...base,
      status: 'skipped',
      checks: [skip('runner=server', 'covered by route.db.test.ts; not exercised by this runner')],
    };
  }

  const client = defaultLlmClient();
  const t0 = Date.now();
  const res = await client.generateDraft(buildMessages(c.prompt));
  const ms = Date.now() - t0;

  if (!res.ok) {
    return {
      ...base,
      status: 'llm_failed',
      llmErrorCode: res.error.code,
      llmErrorMessage: res.error.message,
      tokens: { ms },
    };
  }

  const parsed = MagicComposeDraftSchema.safeParse(res.value);
  if (!parsed.success) {
    return {
      ...base,
      status: 'parse_failed',
      rawOutput: res.value,
      tokens: { ms },
      checks: parsed.error.issues.slice(0, 5).map((i) => ({
        key: `schema:${i.path.join('.') || '(root)'}`,
        outcome: 'fail' as const,
        detail: i.message,
      })),
    };
  }

  const draft = parsed.data;
  const checks: CheckResult[] = [];
  for (const [k, v] of Object.entries(c.expect)) {
    checks.push(runCheck(k, v, draft, res.value));
  }

  return {
    ...base,
    rawOutput: res.value,
    draft,
    checks,
    tokens: { ms },
  };
}

// ── Output ─────────────────────────────────────────────────────────────────

const ICON: Record<Outcome, string> = { pass: '✓', fail: '✗', skip: '·' };

function printCase(run: CaseRun): void {
  const head = `${run.caseId}  [${run.runner}]  ${run.tags.join(',')}`;
  if (run.status === 'skipped') {
    console.log(`\n${head}\n  · skipped (${run.checks[0]?.detail ?? 'server invariant'})`);
    return;
  }
  if (run.status === 'llm_failed') {
    console.log(`\n${head}\n  ✗ LLM error: ${run.llmErrorCode} — ${run.llmErrorMessage}`);
    return;
  }
  if (run.status === 'parse_failed') {
    console.log(`\n${head}  (${run.tokens?.ms}ms)`);
    console.log(`  ✗ draft failed MagicComposeDraftSchema:`);
    for (const c of run.checks) {
      console.log(`    ${ICON[c.outcome]} ${c.key}: ${c.detail}`);
    }
    return;
  }
  const pass = run.checks.filter((c) => c.outcome === 'pass').length;
  const fail = run.checks.filter((c) => c.outcome === 'fail').length;
  const skipN = run.checks.filter((c) => c.outcome === 'skip').length;
  console.log(`\n${head}  (${run.tokens?.ms}ms)  ${pass}✓ ${fail}✗ ${skipN}·`);
  if (run.draft) {
    console.log(
      `  title="${run.draft.title.slice(0, 60)}"  fields=${run.draft.fields.length}  slots=${run.draft.slots.length}  groupBy=${run.draft.groupBy ?? 'null'}`,
    );
  }
  for (const c of run.checks) {
    if (c.outcome === 'pass') continue;
    console.log(`  ${ICON[c.outcome]} ${c.key}${c.detail ? `: ${c.detail}` : ''}`);
  }
}

function printSummary(runs: CaseRun[]): void {
  const total = runs.length;
  const llmOk = runs.filter((r) => r.status === 'ok').length;
  const skipped = runs.filter((r) => r.status === 'skipped').length;
  const llmFailed = runs.filter((r) => r.status === 'llm_failed').length;
  const parseFailed = runs.filter((r) => r.status === 'parse_failed').length;
  const allChecks = runs.flatMap((r) => r.checks);
  const totalPass = allChecks.filter((c) => c.outcome === 'pass').length;
  const totalFail = allChecks.filter((c) => c.outcome === 'fail').length;
  const totalSkip = allChecks.filter((c) => c.outcome === 'skip').length;

  console.log('\n──────────────────────────────────────────────');
  console.log(`Cases: ${total}  ran=${llmOk}  skipped=${skipped}  llm_failed=${llmFailed}  parse_failed=${parseFailed}`);
  console.log(`Checks: ${totalPass}✓  ${totalFail}✗  ${totalSkip}·`);
  console.log('──────────────────────────────────────────────');
}

async function writeSnapshot(runs: CaseRun[]): Promise<string> {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(SNAPSHOT_DIR, `run-${ts}.json`);
  await fs.writeFile(file, JSON.stringify(runs, null, 2));
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allCases = await loadCases();
  const cases = filterCases(allCases, { caseId: args.caseId, tag: args.tag });

  if (args.list) {
    for (const c of cases) {
      console.log(`${c.id.padEnd(48)}  [${c.runner}]  ${c.tags.join(',')}`);
    }
    return;
  }

  if (cases.length === 0) {
    console.error('No cases match the filter.');
    process.exit(1);
  }

  const llmCount = cases.filter((c) => c.runner === 'llm').length;
  if (llmCount > 0 && !magicComposeEnabled()) {
    console.error(
      'LLM cases require LLM_BASE_URL and LLM_MODEL to be set (and matching pair). Aborting.',
    );
    process.exit(2);
  }

  console.log(`Running ${cases.length} case(s) (${llmCount} llm, ${cases.length - llmCount} server)…`);
  const runs: CaseRun[] = [];
  for (const c of cases) {
    const run = await runOneCase(c);
    printCase(run);
    runs.push(run);
  }
  printSummary(runs);

  if (!args.noSnapshot) {
    const file = await writeSnapshot(runs);
    console.log(`Snapshot: ${path.relative(REPO_ROOT, file)}`);
  }

  const anyFail = runs.some(
    (r) => r.status !== 'skipped' && r.checks.some((c) => c.outcome === 'fail'),
  );
  process.exit(anyFail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
