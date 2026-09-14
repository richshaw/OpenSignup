import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@/lib/result';
import type { ToolContext } from '../context';
import { connectTestClient } from '../testing/client';
import { addFieldTool, deleteFieldTool, updateFieldTool } from './fields';
import { addSlotsTool, deleteSlotTool, updateSlotTool } from './slots';

const fields = { addField: vi.fn(), updateField: vi.fn(), deleteField: vi.fn() };
const slots = { addSlotsBulk: vi.fn(), updateSlot: vi.fn(), deleteSlot: vi.fn() };
vi.mock('@/services/slot-fields', () => ({
  addField: (...a: unknown[]) => fields.addField(...a),
  updateField: (...a: unknown[]) => fields.updateField(...a),
  deleteField: (...a: unknown[]) => fields.deleteField(...a),
}));
vi.mock('@/services/slots', () => ({
  addSlotsBulk: (...a: unknown[]) => slots.addSlotsBulk(...a),
  updateSlot: (...a: unknown[]) => slots.updateSlot(...a),
  deleteSlot: (...a: unknown[]) => slots.deleteSlot(...a),
}));

const TOOLS = [addFieldTool, updateFieldTool, deleteFieldTool, addSlotsTool, updateSlotTool, deleteSlotTool];

const ctx: ToolContext = {
  db: {} as ToolContext['db'],
  actor: {
    kind: 'organizer',
    id: 'org_1',
    email: 'a@example.com',
    workspaceIds: ['ws_1'],
    workspaceRoles: { ws_1: 'owner' },
    via: { clientId: 'c' },
  },
  scopes: ['signups:read', 'signups:write'],
  clientId: 'c',
  defaultWorkspaceId: 'ws_1',
  workspaces: [],
};
const field = {
  id: 'fld_1',
  ref: 'what',
  label: 'What',
  fieldType: 'text',
  sortOrder: 0,
  config: { fieldType: 'text', maxLength: 200 },
};
const slot = {
  id: 'slot_1',
  signupId: 'sig_1',
  workspaceId: 'ws_1',
  values: { what: 'x' },
  capacity: 1,
  sortOrder: 0,
  status: 'open',
  slotAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

beforeEach(() => {
  for (const f of [...Object.values(fields), ...Object.values(slots)]) f.mockReset();
});

describe('field tools', () => {
  it('add_field strips signupId and passes the field input through', async () => {
    fields.addField.mockResolvedValueOnce(ok(field));
    const client = await connectTestClient(ctx, TOOLS);
    const r = await client.callTool({
      name: 'add_field',
      arguments: { signupId: 'sig_1', ref: 'what', label: 'What', fieldType: 'text', config: { fieldType: 'text', maxLength: 200 } },
    });
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy();
    expect(fields.addField).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1', {
      ref: 'what',
      label: 'What',
      fieldType: 'text',
      config: { fieldType: 'text', maxLength: 200 },
    });
    expect(r.structuredContent).toEqual({ field });
  });

  it('update_field keeps the strict schema closed', async () => {
    const client = await connectTestClient(ctx, TOOLS);
    const r = await client.callTool({ name: 'update_field', arguments: { fieldId: 'fld_1', label: 'When', bogus: 1 } });
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { error: { code: string } }).error.code).toBe('invalid_input');
    expect(fields.updateField).not.toHaveBeenCalled();
    fields.updateField.mockResolvedValueOnce(ok({ ...field, label: 'When' }));
    const good = await client.callTool({ name: 'update_field', arguments: { fieldId: 'fld_1', label: 'When' } });
    expect(good.isError).toBeFalsy();
    expect(fields.updateField).toHaveBeenCalledWith(ctx.db, ctx.actor, 'fld_1', { label: 'When' });
  });

  it('delete_field is destructive and returns deleted', async () => {
    fields.deleteField.mockResolvedValueOnce(ok({ deleted: true }));
    const client = await connectTestClient(ctx, TOOLS);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === 'delete_field')?.annotations?.destructiveHint).toBe(true);
    const r = await client.callTool({ name: 'delete_field', arguments: { fieldId: 'fld_1' } });
    expect(r.structuredContent).toEqual({ deleted: true });
  });
});

describe('slot tools', () => {
  it('add_slots sends the rows to the bulk service', async () => {
    slots.addSlotsBulk.mockResolvedValueOnce(ok([slot]));
    const client = await connectTestClient(ctx, TOOLS);
    const r = await client.callTool({
      name: 'add_slots',
      arguments: { signupId: 'sig_1', rows: [{ values: { what: 'x' }, capacity: 1 }] },
    });
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy();
    expect(slots.addSlotsBulk).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1', {
      rows: [{ values: { what: 'x' }, capacity: 1 }],
    });
    expect(r.structuredContent).toEqual({
      slots: [{ id: 'slot_1', values: { what: 'x' }, capacity: 1, status: 'open', sortOrder: 0 }],
    });
  });

  it('update_slot and delete_slot address the slot by id', async () => {
    slots.updateSlot.mockResolvedValueOnce(ok({ ...slot, capacity: 4 }));
    slots.deleteSlot.mockResolvedValueOnce(ok({ deleted: true }));
    const client = await connectTestClient(ctx, TOOLS);
    await client.callTool({ name: 'update_slot', arguments: { slotId: 'slot_1', capacity: 4 } });
    expect(slots.updateSlot).toHaveBeenCalledWith(ctx.db, ctx.actor, 'slot_1', { capacity: 4 });
    const r = await client.callTool({ name: 'delete_slot', arguments: { slotId: 'slot_1' } });
    expect(r.structuredContent).toEqual({ deleted: true });
  });
});
