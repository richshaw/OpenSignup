import type { Db } from '@/db/client';
import { serviceError, type ServiceError } from '@/lib/errors';
import { log } from '@/lib/log';
import type { Actor } from '@/lib/policy';
import { err, ok, type Result } from '@/lib/result';
import type { SignupTemplate } from '@/lib/signup-templates';
import { createSignup } from '@/services/signups';
import type { MagicComposeDraft } from './prompt';
import { buildWarnings, hasDropped, magicComposeToTemplate, type DroppedSummary } from './to-template';

type SignupRow = Extract<Awaited<ReturnType<typeof createSignup>>, { ok: true }>['value'];

export interface PersistedDraft {
  signup: SignupRow;
  template: SignupTemplate;
  groupByFieldRefs: string[];
  /** Plain sentences about what the conversion adjusted or dropped; empty when nothing was. */
  warnings: string[];
  dropped: DroppedSummary;
}

/**
 * Turn a draft into a real signup: convert it to a template, then create
 * the signup, its fields and its slots in one transaction. Shared by the
 * Magic Compose route and the MCP `create_signup` tool so the two can never
 * disagree about what a draft becomes.
 *
 * `strict` decides what happens to values the conversion cannot keep (a
 * date that is not ISO, an enum value that is not a choice). A model's
 * draft is best-effort, so Magic Compose persists and reports warnings for
 * the organizer to fix in the builder. A tool call is a deliberate,
 * retryable request, so the tool refuses with `invalid_input` and creates
 * nothing — otherwise a corrected retry would make a second signup.
 */
export async function persistDraft(
  db: Db,
  actor: Actor,
  workspaceId: string,
  draft: MagicComposeDraft,
  opts: { templateId?: string; strict?: boolean; logContext?: Record<string, unknown> } = {},
): Promise<Result<PersistedDraft, ServiceError>> {
  const { template, groupByFieldRefs, dropped } = magicComposeToTemplate(
    draft,
    opts.templateId ? { templateId: opts.templateId } : {},
  );
  const warnings = buildWarnings(dropped);
  if (opts.strict) {
    const valuelessFields = fieldsWithNoValue(template, dropped);
    if (hasDropped(dropped) || valuelessFields.length > 0) {
      return err(
        serviceError(
          'invalid_input',
          hasDropped(dropped)
            ? 'some values do not fit their fields, so nothing was created'
            : 'some fields have no value in any slot, so nothing was created',
          {
            suggestion: describeProblems(dropped, valuelessFields),
            details: { dropped, valuelessFields },
          },
        ),
      );
    }
  } else if (hasDropped(dropped)) {
    log.warn({ dropped, ...(opts.logContext ?? {}) }, 'draft conversion adjusted or dropped values');
  }
  const created = await createSignup(
    db,
    actor,
    workspaceId,
    {
      title: draft.title,
      description: draft.description,
      visibility: 'unlisted',
      settings: groupByFieldRefs.length > 0 ? { groupByFieldRefs } : {},
    },
    { template },
  );
  if (!created.ok) return created;
  return ok({ signup: created.value, template, groupByFieldRefs, warnings, dropped });
}

const EXPECTED: Record<DroppedSummary['coercionFailures'][number]['reason'], string> = {
  date: 'an ISO date like 2026-10-03',
  time: 'a 24-hour time like 14:30',
  enum: 'one of the field choices',
  number: 'a number, not a string',
  text: 'text',
};

/**
 * Fields no slot gives a value, usually ones the caller meant participants to
 * fill in. Strict only: Magic Compose keeps them, and `add_field` starts a
 * field blank on purpose. A field whose values all failed coercion is left
 * out, since its format problem is already reported.
 */
function fieldsWithNoValue(template: SignupTemplate, d: DroppedSummary): string[] {
  const misformatted = new Set(d.coercionFailures.map((f) => f.ref));
  return template.fields
    .map((f) => f.ref)
    .filter((ref) => !misformatted.has(ref) && !template.slots.some((s) => s.values[ref] !== undefined));
}

/** What a deliberate caller has to change, one clause per problem. */
function describeProblems(d: DroppedSummary, valuelessFields: string[]): string {
  const parts: string[] = [];
  for (const f of d.coercionFailures) parts.push(`slot ${f.slot + 1} "${f.ref}" must be ${EXPECTED[f.reason]}`);
  for (const ref of d.emptyEnumFields) parts.push(`enum field "${ref}" needs at least one choice`);
  for (const ref of d.duplicateRefs) parts.push(`field ref "${ref}" is used more than once`);
  for (const key of d.strayValueKeys) parts.push(`value key "${key}" matches no field ref`);
  for (const ref of valuelessFields) parts.push(`field "${ref}" has no value in any slot`);
  let out = parts.join('; ') + '.';
  if (valuelessFields.length > 0) {
    out +=
      ' Fields are columns the organizer fills in; people who sign up give their own name, email and note. ' +
      (valuelessFields.length === 1
        ? 'Remove the field, or give it a value in the slots it applies to.'
        : 'Remove those fields, or give each a value in the slots it applies to.');
  }
  return out;
}
