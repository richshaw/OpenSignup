import { describe, expect, it } from 'vitest';
import {
  NO_FIELDS_FOR_PARTICIPANT_DETAILS,
  RULES_IN_BOTH,
  USE_CAPACITY_NOT_DUPLICATE_ROWS,
  USE_DATE_AND_TIME_FIELDS,
  neverInventRule,
} from '@/lib/signup-rules';
import { buildInstructions } from './instructions';

// A stand-in list: the builder takes its tools as an argument, so this file
// loads no tool module and needs no service mocks.
const tools = [
  { name: 'list_things' },
  { name: 'make_thing' },
  { name: 'drop_thing', askFirst: true as const },
  { name: 'wipe_things', askFirst: true as const },
];
const text = buildInstructions(tools);
const lines = text.split('\n');

describe('buildInstructions', () => {
  it('carries every rule it shares with the Magic Compose prompt, word for word', () => {
    for (const rule of RULES_IN_BOTH) expect(text).toContain(rule);
  });

  it('tells the assistant to ask rather than fill gaps with placeholders', () => {
    expect(text).toContain(neverInventRule('assistant'));
    expect(text).not.toContain('placeholder');
  });

  it('says when not to group, as the prompt does after the same sentence', () => {
    const line = lines.find((l) => l.includes('"groupBy"'));
    expect(line).toMatch(/Leave it out when every slot would be its own group/);
  });

  it('says what is fine before it says what is not', () => {
    const line = lines.find((l) => l.includes('What is not fine')) ?? '';
    expect(line.indexOf('are fine and expected')).toBeGreaterThan(-1);
    expect(line.indexOf('are fine and expected')).toBeLessThan(line.indexOf('What is not fine'));
  });

  it('carries the rules written for assistants, and the capacity rule it had first', () => {
    expect(text).toContain(USE_DATE_AND_TIME_FIELDS);
    expect(text).toContain(USE_CAPACITY_NOT_DUPLICATE_ROWS);
    expect(text).toContain(NO_FIELDS_FOR_PARTICIPANT_DETAILS);
  });

  it('says what participants give, right after the slots-are-the-atom line', () => {
    const atom = lines.findIndex((l) => l.includes('Slots are the atom'));
    expect(lines[atom + 1]).toBe(`- ${NO_FIELDS_FOR_PARTICIPANT_DETAILS}`);
  });

  it('ends with the tools it was given, in order', () => {
    // Last, so a client that cuts the text short loses the list that
    // tools/list repeats anyway, not a rule.
    expect(lines.at(-1)).toBe('Tools: list_things, make_thing, drop_thing, wipe_things.');
  });

  it('lists exactly the ask-first tools as ones to ask about first', () => {
    const ask = lines.filter((l) => l.startsWith('- Ask the organizer before'));
    expect(ask).toEqual(['- Ask the organizer before you call: drop_thing, wipe_things.']);
  });

  it('drops that line when no tool is ask-first', () => {
    const safe = buildInstructions(tools.filter((t) => !t.askFirst));
    expect(safe).not.toContain('Ask the organizer before you call:');
  });

  it('says which link to give when, and to show slots as a table', () => {
    for (const word of ['links.preview', 'links.edit', 'links.public', 'publish_signup', 'table']) {
      expect(text).toContain(word);
    }
  });

  it('has no line left blank by a missing rule', () => {
    expect(text).not.toMatch(/undefined|\n\n\n|^- *$/m);
  });
});
