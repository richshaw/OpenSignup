import { beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/lib/result';
import { serviceError } from '@/lib/errors';
import { connectTestClient } from '../testing/client';
import { unitContext } from '../testing/fixtures';
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
vi.mock('@/mcp/links', () => ({ signupLinks: () => ({ edit: 'e', preview: 'v', public: 'p' }) }));

const TOOLS = [addFieldTool, updateFieldTool, deleteFieldTool, addSlotsTool, updateSlotTool, deleteSlotTool];
const ctx = unitContext();
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
  it('add_field takes the create_signup field shape and builds the config itself', async () => {
    fields.addField.mockResolvedValueOnce(ok({ ...field, ref: 'day', label: 'Day', fieldType: 'enum', config: { fieldType: 'enum', choices: ['Sat', 'Sun'] } }));
    const client = await connectTestClient(ctx, TOOLS);
    const r = await client.callTool({
      name: 'add_field',
      arguments: { signupId: 'sig_1', ref: 'day', label: 'Day', fieldType: 'enum', choices: ['Sat', 'Sun'] },
    });
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy();
    expect(fields.addField).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1', {
      ref: 'day',
      label: 'Day',
      fieldType: 'enum',
      config: { fieldType: 'enum', choices: ['Sat', 'Sun'] },
    });
    expect((r.structuredContent as { field: { config: unknown } }).field.config).toEqual({ fieldType: 'enum', choices: ['Sat', 'Sun'] });
  });

  it('add_field passes an explicit position through and defaults text to a 200-character config', async () => {
    fields.addField.mockResolvedValueOnce(ok(field));
    const client = await connectTestClient(ctx, TOOLS);
    await client.callTool({ name: 'add_field', arguments: { signupId: 'sig_1', ref: 'what', label: 'What', fieldType: 'text', sortOrder: 3 } });
    expect(fields.addField).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1', {
      ref: 'what',
      label: 'What',
      fieldType: 'text',
      config: { fieldType: 'text', maxLength: 200 },
      sortOrder: 3,
    });
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
  it('add_slots sends the rows to the bulk service with capacity defaulting to 1', async () => {
    slots.addSlotsBulk.mockResolvedValueOnce(ok([slot, { ...slot, id: 'slot_2', capacity: null }]));
    const client = await connectTestClient(ctx, TOOLS);
    const r = await client.callTool({
      name: 'add_slots',
      arguments: { signupId: 'sig_1', rows: [{ values: { what: 'x' } }, { values: { what: 'y' }, capacity: null }] },
    });
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy();
    expect(slots.addSlotsBulk).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1', {
      rows: [
        { values: { what: 'x' }, capacity: 1 },
        { values: { what: 'y' }, capacity: null },
      ],
    });
    expect(r.structuredContent).toEqual({
      slots: [
        { id: 'slot_1', values: { what: 'x' }, capacity: 1, status: 'open', sortOrder: 0 },
        { id: 'slot_2', values: { what: 'x' }, capacity: null, status: 'open', sortOrder: 0 },
      ],
    });
  });

  it('update_slot addresses the slot by id', async () => {
    slots.updateSlot.mockResolvedValueOnce(ok({ ...slot, capacity: 4 }));
    const client = await connectTestClient(ctx, TOOLS);
    const r = await client.callTool({ name: 'update_slot', arguments: { slotId: 'slot_1', capacity: 4 } });
    expect(slots.updateSlot).toHaveBeenCalledWith(ctx.db, ctx.actor, 'slot_1', { capacity: 4 });
    expect((r.structuredContent as { slot: { capacity: number } }).slot.capacity).toBe(4);
  });

  it('delete_slot asks the service not to force unless told, and relays the conflict', async () => {
    slots.deleteSlot.mockResolvedValueOnce(err(serviceError('conflict', '2 people have signed up for this slot', { details: { filled: 2 } })));
    const client = await connectTestClient(ctx, TOOLS);
    const refused = await client.callTool({ name: 'delete_slot', arguments: { slotId: 'slot_1' } });
    expect(slots.deleteSlot).toHaveBeenCalledWith(ctx.db, ctx.actor, 'slot_1', { force: false });
    expect((refused.structuredContent as { error: { code: string; details: { filled: number } } }).error).toMatchObject({ code: 'conflict', details: { filled: 2 } });
    slots.deleteSlot.mockResolvedValueOnce(ok({ deleted: true, commitmentsRemoved: 2 }));
    const forced = await client.callTool({ name: 'delete_slot', arguments: { slotId: 'slot_1', force: true } });
    expect(slots.deleteSlot).toHaveBeenLastCalledWith(ctx.db, ctx.actor, 'slot_1', { force: true });
    expect(forced.structuredContent).toEqual({ deleted: true, commitmentsRemoved: 2 });
  });
});
