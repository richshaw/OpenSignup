import { describe, expect, it } from 'vitest';
import { WORKSPACE_LIST_LIMIT } from '@/schemas/signups';
import { MAX_BULK_SLOT_ROWS } from '@/schemas/slots';
import { toJsonSchema } from '../registry';
import { listSignups } from './signups-read';
import { addSlotsTool } from './slots';

// The tools repeat limits the services enforce. These pin each copy to the
// one constant, so changing the cap changes the tool too.
describe('MCP tool limits follow the service constants', () => {
  it('add_slots caps rows at MAX_BULK_SLOT_ROWS and says so', () => {
    const json = toJsonSchema(addSlotsTool.inputSchema) as {
      properties: { rows: { maxItems?: number } };
    };
    expect(json.properties.rows.maxItems).toBe(MAX_BULK_SLOT_ROWS);
    expect(addSlotsTool.description).toContain(`(up to ${MAX_BULK_SLOT_ROWS})`);

    const row = { values: {} };
    const input = (n: number) => ({
      signupId: 'sig_x',
      rows: Array.from({ length: n }, () => row),
    });
    expect(addSlotsTool.inputSchema.safeParse(input(MAX_BULK_SLOT_ROWS)).success).toBe(true);
    expect(addSlotsTool.inputSchema.safeParse(input(MAX_BULK_SLOT_ROWS + 1)).success).toBe(false);
  });

  it('list_signups says it returns up to WORKSPACE_LIST_LIMIT', () => {
    expect(listSignups.description).toContain(`up to ${WORKSPACE_LIST_LIMIT}.`);
  });
});
