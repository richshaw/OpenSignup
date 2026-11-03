import { shortenToLimit } from '@/lib/shorten';
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH } from '@/schemas/signups';

const LIMITS = [
  { key: 'title', max: TITLE_MAX_LENGTH },
  { key: 'description', max: DESCRIPTION_MAX_LENGTH },
] as const;

/**
 * Magic Compose only: shorten a model's over-long title or description before
 * the draft is validated, so a draft that is fine otherwise still becomes a
 * signup, with a warning for each cut. The MCP `create_signup` tool doesn't
 * use this: there an over-long value is refused, so the assistant can retry.
 */
export function fitDraftText(raw: unknown): { value: unknown; warnings: string[] } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { value: raw, warnings: [] };
  }
  const draft = { ...(raw as Record<string, unknown>) };
  const warnings: string[] = [];
  for (const { key, max } of LIMITS) {
    const text = draft[key];
    if (typeof text !== 'string' || text.length <= max) continue;
    draft[key] = shortenToLimit(text, max);
    warnings.push(
      `The AI's ${key} was longer than ${max.toLocaleString('en-US')} characters, so the end was cut off. Check it below.`,
    );
  }
  return { value: warnings.length > 0 ? draft : raw, warnings };
}
