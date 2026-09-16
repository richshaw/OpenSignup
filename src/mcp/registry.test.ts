import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { SlotFieldUpdateInputSchema } from '@/schemas/slot-fields';
import { SlotBulkInputSchema } from '@/schemas/slots';
import { RESOURCE_SCOPES } from '@/oauth/scopes';
import { toJsonSchema } from './registry';
import { TOOLS, toolScope } from './tools';

describe('toJsonSchema', () => {
  it('emits an object-rooted schema with no $schema and no $ref', () => {
    const json = toJsonSchema(
      z.object({ signupId: z.string(), status: z.enum(['open', 'closed']).optional() }),
    ) as Record<string, unknown>;
    expect(json.type).toBe('object');
    expect(json).not.toHaveProperty('$schema');
    expect(JSON.stringify(json)).not.toContain('$ref');
    expect(json.required as string[]).toEqual(['signupId']);
  });

  it('inlines a sub-schema that is reused, instead of a $ref pointer clients cannot follow', () => {
    const Values = z.object({ a: z.string() });
    const json = toJsonSchema(z.object({ first: Values, second: Values, rows: SlotBulkInputSchema.shape.rows }));
    const text = JSON.stringify(json);
    expect(text).not.toContain('$ref');
    expect((json as { properties: Record<string, { type?: string }> }).properties.second?.type).toBe('object');
  });

  it('keeps strict objects closed when extended with an id', () => {
    const json = toJsonSchema(SlotFieldUpdateInputSchema.extend({ fieldId: z.string() })) as Record<string, unknown>;
    expect(json.additionalProperties).toBe(false);
    expect(Object.keys(json.properties as object)).toContain('fieldId');
  });
});

describe('the tool registry', () => {
  it('gives every tool a resource scope and an object-rooted, reference-free schema', () => {
    expect(TOOLS.length).toBeGreaterThan(0);
    const names = new Set<string>();
    for (const tool of TOOLS) {
      expect(names.has(tool.name), `duplicate tool name ${tool.name}`).toBe(false);
      names.add(tool.name);
      expect(RESOURCE_SCOPES).toContain(tool.scope);
      const json = toJsonSchema(tool.inputSchema) as Record<string, unknown>;
      expect(json.type, tool.name).toBe('object');
      expect(JSON.stringify(json), tool.name).not.toContain('$ref');
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
    }
  });

  it('toolScope answers for known tools and null for unknown ones', () => {
    expect(toolScope('list_signups')).toBe('signups:read');
    expect(toolScope('create_signup')).toBe('signups:write');
    expect(toolScope('nope')).toBeNull();
  });

  it('exposes exactly this roster', () => {
    // Spelled out rather than derived from TOOLS: the flow test compares the
    // endpoint against TOOLS, so if a tool went missing from TOOLS both would
    // still agree with each other. This is the list that has to change on
    // purpose.
    expect([...TOOLS].map((t) => t.name).sort()).toEqual([
      'add_field',
      'add_slots',
      'archive_signup',
      'close_signup',
      'create_signup',
      'delete_field',
      'delete_signup',
      'delete_slot',
      'get_signup',
      'list_signups',
      'list_workspaces',
      'publish_signup',
      'update_field',
      'update_signup',
      'update_slot',
    ]);
  });
});
