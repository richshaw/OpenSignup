import {
  GROUP_BY_SCAN_AXIS,
  NO_INTAKE_FORMS,
  NO_PERSONAL_DATA,
  ONE_SLOT_PER_COMBINATION,
  SLOTS_ARE_THE_ATOM,
  USE_CAPACITY_NOT_DUPLICATE_ROWS,
  USE_DATE_AND_TIME_FIELDS,
  neverInventRule,
} from '@/lib/signup-rules';
import type { ToolDefinition } from './registry';

/**
 * The `instructions` a client receives on initialize: how to design a good
 * signup and how to work with the organizer, in one place instead of spread
 * over tool descriptions. The design rules are the sentences the Magic Compose
 * prompt uses (`src/lib/signup-rules.ts`), so the two cannot disagree. Tool
 * descriptions still stand on their own, because some clients ignore this.
 *
 * Takes the tool list rather than importing `./tools`, which would pull every
 * service into any unit test that loads this file. Both lists are derived from
 * it so they cannot drift. Keep the whole text within 2048 bytes (a test
 * checks): some clients cut it off there, which is also why the tools line
 * comes last.
 */
export function buildInstructions(
  tools: readonly Pick<ToolDefinition, 'name' | 'annotations'>[],
): string {
  const names = tools.map((t) => t.name);
  const destructive = tools.filter((t) => t.annotations.destructiveHint).map((t) => t.name);
  const lines = [
    `An OpenSignup signup is a list of slots that people sign up for without an account.`,
    ``,
    `Designing a signup`,
    `- ${USE_DATE_AND_TIME_FIELDS}`,
    `- ${USE_CAPACITY_NOT_DUPLICATE_ROWS}`,
    `- For a grid (say 2 days × 3 shifts), ${ONE_SLOT_PER_COMBINATION}`,
    `- When you create a signup, ${GROUP_BY_SCAN_AXIS}.`,
    `- ${neverInventRule('assistant')}`,
    `- ${SLOTS_ARE_THE_ATOM} ${NO_INTAKE_FORMS}`,
    `- ${NO_PERSONAL_DATA} Say why instead.`,
    ``,
    `Working with the organizer`,
    `- A new signup is a draft that participants cannot see. Give the organizer links.preview (what participants will see) and links.edit (to change it). Ask before you call publish_signup. Share links.public only after that: until then it only says the signup is not ready yet.`,
    `- After you create or change slots, show them as a table.`,
    ...(destructive.length > 0
      ? [`- Ask the organizer before you call: ${destructive.join(', ')}.`]
      : []),
    ``,
    `Tools: ${names.join(', ')}.`,
  ];
  return lines.join('\n');
}
