/**
 * Scoring for the MCP follow-up evals (`evals/mcp/followup-evals.json`). A
 * follow-up case is scored on what the conversation did, not on a draft: the
 * tools the model called after the first message, the signup's slots after
 * the first message and after the last, and the model's last reply.
 */

export interface SlotState {
  id: string;
  values: Record<string, unknown>;
  capacity: number | null;
}

export interface FollowupState {
  /** The signup's slots, in order, once the first message was answered. */
  before: SlotState[];
  /** The same signup's slots, in order, once the last message was answered. */
  after: SlotState[];
  /** The signup's links.edit, which a "show me" reply should give. */
  editLink: string;
  /** Every tool the model called after the first message, in order. */
  followUpToolCalls: string[];
  /** The model's reply to the last message. */
  reply: string;
}

export interface FollowupCheck {
  key: string;
  outcome: 'pass' | 'fail' | 'skip';
  detail?: string;
}

const pass = (key: string): FollowupCheck => ({ key, outcome: 'pass' });
const fail = (key: string, detail: string): FollowupCheck => ({ key, outcome: 'fail', detail });
const skip = (key: string, detail: string): FollowupCheck => ({ key, outcome: 'skip', detail });

function strings(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;
}

/** A slot's values with keys sorted, so two slots with the same answers compare equal. */
function valuesKey(s: SlotState): string {
  return JSON.stringify(Object.keys(s.values).sort().map((k) => [k, s.values[k]]));
}

/**
 * Rows of every Markdown table in `text`, not counting header rows (the line
 * above a `|---|` separator) or the separators themselves.
 */
export function markdownTableRows(text: string): number {
  const lines = text.split('\n').map((l) => l.trim());
  const isRow = (l: string) => l.startsWith('|') && l.endsWith('|') && l.length > 1;
  const isSeparator = (l: string) => isRow(l) && /^\|(\s*:?-{3,}:?\s*\|)+$/.test(l);
  let rows = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (!isRow(l) || isSeparator(l)) continue;
    if (isSeparator(lines[i + 1] ?? '')) continue;
    rows++;
  }
  return rows;
}

export function runFollowupCheck(key: string, expected: unknown, state: FollowupState): FollowupCheck {
  const beforeIds = new Set(state.before.map((s) => s.id));
  const afterIds = new Set(state.after.map((s) => s.id));
  const added = state.after.filter((s) => !beforeIds.has(s.id));

  switch (key) {
    case 'followups.tools_must_include': {
      const a = strings(expected);
      if (!a) return skip(key, 'expected string[]');
      const missing = a.filter((t) => !state.followUpToolCalls.includes(t));
      return missing.length === 0 ? pass(key) : fail(key, `never called ${missing.join(', ')}`);
    }
    case 'followups.tools_must_not_include': {
      const a = strings(expected);
      if (!a) return skip(key, 'expected string[]');
      const hits = a.filter((t) => state.followUpToolCalls.includes(t));
      return hits.length === 0 ? pass(key) : fail(key, `called ${hits.join(', ')}`);
    }

    case 'slots.added_count': {
      if (typeof expected !== 'number') return skip(key, 'expected number');
      return added.length === expected ? pass(key) : fail(key, `${added.length} slots added, expected ${expected}`);
    }
    case 'slots.removed_count': {
      if (typeof expected !== 'number') return skip(key, 'expected number');
      const removed = state.before.filter((s) => !afterIds.has(s.id)).length;
      return removed === expected ? pass(key) : fail(key, `${removed} slots removed, expected ${expected}`);
    }
    case 'slots.first_is_new': {
      if (expected !== true) return skip(key, 'expected true');
      const first = state.after[0];
      if (!first) return fail(key, 'the signup has no slots');
      return beforeIds.has(first.id)
        ? fail(key, `the first slot is one the first message made: ${JSON.stringify(first.values)}`)
        : pass(key);
    }
    case 'slots.first_values_must_mention_any': {
      const a = strings(expected);
      if (!a) return skip(key, 'expected string[]');
      const first = state.after[0];
      if (!first) return fail(key, 'the signup has no slots');
      const text = Object.values(first.values).map(String).join(' ').toLowerCase();
      return a.some((s) => text.includes(s.toLowerCase()))
        ? pass(key)
        : fail(key, `first slot ${JSON.stringify(first.values)} mentions none of ${JSON.stringify(a)}`);
    }
    case 'slots.no_duplicates': {
      if (expected !== true) return skip(key, 'expected true');
      const seen = new Set<string>();
      const dupes = state.after.filter((s) => {
        const k = valuesKey(s);
        if (seen.has(k)) return true;
        seen.add(k);
        return false;
      });
      return dupes.length === 0
        ? pass(key)
        : fail(key, `${dupes.length} slots repeat another's values, e.g. ${JSON.stringify(dupes[0]!.values)}`);
    }
    case 'slots.capacities_changed': {
      if (expected !== true) return skip(key, 'expected true');
      const was = new Map(state.before.map((s) => [s.id, s.capacity]));
      const changed = state.after.some((s) => was.has(s.id) && was.get(s.id) !== s.capacity);
      return changed ? pass(key) : fail(key, 'no existing slot has a different capacity');
    }
    case 'slots.capacity_sum_range': {
      if (!Array.isArray(expected) || expected.length !== 2) return skip(key, 'expected [min,max]');
      const [min, max] = expected as [number, number];
      if (state.after.some((s) => s.capacity === null)) return fail(key, 'a slot has no limit');
      const sum = state.after.reduce((n, s) => n + (s.capacity ?? 0), 0);
      return sum >= min && sum <= max ? pass(key) : fail(key, `capacities sum to ${sum}, not in [${min},${max}]`);
    }

    case 'reply.table_row_per_slot': {
      if (expected !== true) return skip(key, 'expected true');
      const rows = markdownTableRows(state.reply);
      return rows >= state.after.length
        ? pass(key)
        : fail(key, `${rows} table rows for ${state.after.length} slots`);
    }
    case 'reply.must_include_edit_link': {
      if (expected !== true) return skip(key, 'expected true');
      return state.reply.includes(state.editLink) ? pass(key) : fail(key, `reply has no ${state.editLink}`);
    }

    case 'rationale':
      return skip(key, 'prose-only — not machine-checkable');
    default:
      return skip(key, 'unsupported key (extend followup-checks.ts if you need it)');
  }
}

export function scoreFollowup(expect: Record<string, unknown>, state: FollowupState): FollowupCheck[] {
  return Object.entries(expect).map(([k, v]) => runFollowupCheck(k, v, state));
}
