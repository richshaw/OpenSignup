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
 * descriptions still stand on their own, because some clients ignore this,
 * but they only say what a tool does: the Claude connectors directory refuses
 * descriptions that tell the model how to behave, so the "Working with the
 * organizer" lines exist here and nowhere else.
 *
 * Takes the tool list rather than importing `./tools`, which would pull every
 * service into any unit test that loads this file. The tools line is derived
 * from it and cannot drift; the ask-first line lists the tools that set
 * `askFirst`. That is narrower than `destructiveHint`, which every update
 * carries too: asking before each edit the organizer just requested would
 * be noise.
 *
 * Some clients cut the text off at 2048 bytes. Everything before the tools
 * line must fit in that (a test checks), so no rule is ever lost. The tools
 * line comes last because it is the part that is safe to lose: tools/list
 * repeats it, and so a new tool name never forces a reword of the rules.
 */
export function buildInstructions(
  tools: readonly Pick<ToolDefinition, 'name' | 'askFirst'>[],
): string {
  const names = tools.map((t) => t.name);
  const askFirst = tools.filter((t) => t.askFirst).map((t) => t.name);
  const lines = [
    `An OpenSignup signup is a list of slots that people sign up for without an account.`,
    ``,
    `Designing a signup`,
    `- ${USE_DATE_AND_TIME_FIELDS}`,
    `- ${USE_CAPACITY_NOT_DUPLICATE_ROWS}`,
    `- For a grid (say 2 days × 3 shifts), ${ONE_SLOT_PER_COMBINATION}`,
    `- When you create a signup, ${GROUP_BY_SCAN_AXIS}. Leave it out when every slot would be its own group, such as a plain list of dates.`,
    `- ${neverInventRule('assistant')}`,
    `- ${SLOTS_ARE_THE_ATOM} Fields that describe the slot are fine and expected. ${NO_INTAKE_FORMS}`,
    `- ${NO_PERSONAL_DATA} Say why instead.`,
    ``,
    `Working with the organizer`,
    `- A new signup is a draft that participants cannot see. Give the organizer links.preview (what participants will see) and links.edit (to change it). Ask before you call publish_signup. Share links.public only after that: until then it only says the signup is not ready yet.`,
    `- After you create or change slots, show them as a table.`,
    ...(askFirst.length > 0
      ? [`- Ask the organizer before you call: ${askFirst.join(', ')}.`]
      : []),
    ``,
    `Tools: ${names.join(', ')}.`,
  ];
  return lines.join('\n');
}
