import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceError, ServiceException } from '@/lib/errors';
import { err, ok } from '@/lib/result';
import { connectTestClient } from '../testing/client';
import { signupRow, unitContext } from '../testing/fixtures';
import {
  archiveSignupTool,
  closeSignupTool,
  createSignupTool,
  deleteSignupTool,
  publishSignupTool,
  updateSignupTool,
} from './signups-write';

const WRITE_TOOLS = [
  createSignupTool,
  updateSignupTool,
  publishSignupTool,
  closeSignupTool,
  archiveSignupTool,
  deleteSignupTool,
];

const svc = {
  createSignup: vi.fn(),
  updateSignup: vi.fn(),
  publishSignup: vi.fn(),
  closeSignup: vi.fn(),
  archiveSignup: vi.fn(),
  deleteSignup: vi.fn(),
  getSignupForOrganizer: vi.fn(),
  listSignupsForWorkspace: vi.fn(),
};
vi.mock('@/services/signups', () => ({
  createSignup: (...a: unknown[]) => svc.createSignup(...a),
  updateSignup: (...a: unknown[]) => svc.updateSignup(...a),
  publishSignup: (...a: unknown[]) => svc.publishSignup(...a),
  closeSignup: (...a: unknown[]) => svc.closeSignup(...a),
  archiveSignup: (...a: unknown[]) => svc.archiveSignup(...a),
  deleteSignup: (...a: unknown[]) => svc.deleteSignup(...a),
  getSignupForOrganizer: (...a: unknown[]) => svc.getSignupForOrganizer(...a),
  listSignupsForWorkspace: (...a: unknown[]) => svc.listSignupsForWorkspace(...a),
}));
const consume = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, consumeRateLimit: (...a: unknown[]) => consume(...a) };
});
vi.mock('@/mcp/links', () => ({
  signupLinks: (r: { id: string; slug: string }) => ({ edit: `e/${r.id}`, preview: `v/${r.id}`, public: `p/${r.slug}` }),
}));

const ctx = unitContext();
const row = signupRow({
  slug: 'snack-rota',
  title: 'Snack rota',
  description: '',
  settings: { groupByFieldRefs: ['date'], sendReminders: true, requireEmail: true },
});

/** What the read service hands back for the signup `create_signup` just made. */
const created = {
  ...row,
  fields: [
    { id: 'fld_1', ref: 'date', label: 'Date', fieldType: 'date', sortOrder: 0, config: {} },
    { id: 'fld_2', ref: 'what', label: 'What', fieldType: 'text', sortOrder: 1, config: {} },
  ],
  slots: [
    { id: 'slot_1', values: { what: 'Fruit' }, capacity: 2, status: 'open', sortOrder: 0 },
    { id: 'slot_2', values: { what: 'Crackers' }, capacity: null, status: 'open', sortOrder: 1 },
  ],
};

beforeEach(() => {
  for (const f of Object.values(svc)) f.mockReset();
  consume.mockClear();
});

describe('create_signup', () => {
  it('converts the draft, meters the organizer, and creates everything in one call', async () => {
    svc.createSignup.mockResolvedValueOnce(ok(row));
    svc.getSignupForOrganizer.mockResolvedValueOnce(ok(created));
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({
      name: 'create_signup',
      arguments: {
        title: 'Snack rota',
        fields: [
          { ref: 'date', label: 'Date', fieldType: 'date' },
          { ref: 'what', label: 'What', fieldType: 'text' },
        ],
        slots: [
          { values: { date: '2026-10-03', what: 'Fruit' }, capacity: 2 },
          { values: { date: '2026-10-10', what: 'Crackers' }, capacity: null },
        ],
        groupBy: 'date',
      },
    });
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy();
    expect(consume.mock.calls.at(-1)?.[1]).toMatchObject({ bucket: 'signup.create' });
    expect(consume.mock.calls.at(-1)?.[2]).toBe('org_1');
    const [, actor, ws, input, opts] = svc.createSignup.mock.calls[0] as [
      unknown,
      unknown,
      string,
      Record<string, unknown>,
      { template: { id: string; fields: unknown[]; slots: unknown[] } },
    ];
    expect(actor).toBe(ctx.actor);
    expect(ws).toBe('ws_1');
    expect(input).toEqual({ title: 'Snack rota', description: '', visibility: 'unlisted', settings: {} });
    expect(opts.template.id).toBe('mcp');
    expect(opts.template.fields).toHaveLength(2);
    expect(opts.template.slots).toHaveLength(2);
    // The slots come from a read of what was stored, not from the input.
    expect(svc.getSignupForOrganizer).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1');
    expect(r.structuredContent).toMatchObject({
      signup: { id: 'sig_1', status: 'draft' },
      fields: [
        { id: 'fld_1', ref: 'date' },
        { id: 'fld_2', ref: 'what' },
      ],
      links: { edit: 'e/sig_1', preview: 'v/sig_1', public: 'p/snack-rota' },
    });
    expect((r.structuredContent as { slots: unknown[] }).slots).toEqual(
      created.slots.map((s) => ({ ...s, filled: 0 })),
    );
    expect(r.structuredContent).not.toHaveProperty('summary');
  });

  // The signup exists by then, so an error would invite a retry that creates it twice.
  it.each([
    ['returns an error', () => Promise.resolve(err(serviceError('not_found', 'gone')))],
    ['throws', () => Promise.reject(new Error('connection lost'))],
  ])('still reports the create when reading it back %s', async (_how, readBack) => {
    svc.createSignup.mockResolvedValueOnce(ok(row));
    svc.getSignupForOrganizer.mockImplementationOnce(readBack);
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'x y', fields: [{ ref: 'a', label: 'A', fieldType: 'text' }], slots: [{}] },
    });
    expect(r.isError).toBeFalsy();
    const body = r.structuredContent as { signup: { id: string }; links: unknown; note: string };
    expect(body.signup.id).toBe('sig_1');
    expect(body.links).toEqual({ edit: 'e/sig_1', preview: 'v/sig_1', public: 'p/snack-rota' });
    expect(body.note).toContain('get_signup');
    expect(body.note).toContain('do not create it again');
    expect(body).not.toHaveProperty('fields');
    expect(body).not.toHaveProperty('slots');
  });

  it('refuses a value that does not fit its field and creates nothing', async () => {
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({
      name: 'create_signup',
      arguments: {
        title: 'Snack rota',
        fields: [{ ref: 'date', label: 'Date', fieldType: 'date' }],
        slots: [{ values: { date: 'next saturday' } }],
      },
    });
    expect(r.isError).toBe(true);
    const body = r.structuredContent as { error: { code: string; suggestion: string; details: { dropped: unknown } } };
    expect(body.error.code).toBe('invalid_input');
    expect(body.error.suggestion).toMatch(/date/i);
    expect(body.error.details.dropped).toBeTruthy();
    expect(svc.createSignup).not.toHaveBeenCalled();
  });

  it('checks the workspace role before spending create quota', async () => {
    const viewer = unitContext({
      actor: { ...ctx.actor, workspaceRoles: { ws_1: 'viewer' } },
      workspaces: [{ id: 'ws_1', slug: 'w', name: 'W', role: 'viewer' }],
    });
    const client = await connectTestClient(viewer, WRITE_TOOLS);
    const r = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'x y', fields: [{ ref: 'a', label: 'A', fieldType: 'text' }], slots: [{}] },
    });
    expect((r.structuredContent as { error: { code: string } }).error.code).toBe('forbidden');
    expect(consume).not.toHaveBeenCalled();
    expect(svc.createSignup).not.toHaveBeenCalled();
  });

  it('turns the rate limit into a tool error', async () => {
    consume.mockImplementationOnce(async () => {
      throw new ServiceException(serviceError('rate_limited', 'slow down', { details: { retryAfterSeconds: 30 } }));
    });
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({
      name: 'create_signup',
      arguments: { title: 'x y', fields: [{ ref: 'a', label: 'A', fieldType: 'text' }], slots: [{}] },
    });
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { error: { code: string } }).error.code).toBe('rate_limited');
    expect(svc.createSignup).not.toHaveBeenCalled();
  });
});

describe('update_signup', () => {
  it('hands sparse settings to the service to merge, including nulls that clear a key', async () => {
    svc.updateSignup.mockResolvedValueOnce(ok({ ...row, settings: { ...row.settings, sendReminders: false } }));
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({
      name: 'update_signup',
      arguments: { signupId: 'sig_1', settings: { sendReminders: false, maxCommitmentsPerParticipant: null } },
    });
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy();
    expect(svc.getSignupForOrganizer).not.toHaveBeenCalled();
    expect(svc.updateSignup).toHaveBeenCalledWith(
      ctx.db,
      ctx.actor,
      'sig_1',
      { settings: { sendReminders: false, maxCommitmentsPerParticipant: null } },
      { mergeSettings: true },
    );
  });

  it('passes plain fields through and lets closesAt be cleared with null', async () => {
    svc.updateSignup.mockResolvedValueOnce(ok({ ...row, title: 'New' }));
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    await client.callTool({
      name: 'update_signup',
      arguments: { signupId: 'sig_1', title: 'New', description: 'Desc', closesAt: null },
    });
    expect(svc.updateSignup).toHaveBeenCalledWith(
      ctx.db,
      ctx.actor,
      'sig_1',
      { title: 'New', description: 'Desc', closesAt: null },
      { mergeSettings: true },
    );
  });

  it('does not offer the password visibility, which nothing enforces', async () => {
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({ name: 'update_signup', arguments: { signupId: 'sig_1', visibility: 'password' } });
    expect((r.structuredContent as { error: { code: string; field?: string } }).error).toMatchObject({
      code: 'invalid_input',
      field: 'visibility',
    });
    expect(svc.updateSignup).not.toHaveBeenCalled();
  });
});

describe('status tools', () => {
  it.each([
    ['publish_signup', 'publishSignup'],
    ['close_signup', 'closeSignup'],
    ['archive_signup', 'archiveSignup'],
    ['delete_signup', 'deleteSignup'],
  ] as const)('%s calls %s with the id', async (tool, fn) => {
    svc[fn].mockResolvedValueOnce(ok(row));
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({ name: tool, arguments: { signupId: 'sig_1' } });
    expect(r.isError).toBeFalsy();
    expect(svc[fn]).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1');
  });

  it('says which link to hand over before and after publishing', () => {
    expect(createSignupTool.description).toContain('links.edit');
    expect(createSignupTool.description).toContain('links.preview');
    expect(createSignupTool.description).toContain('links.public');
    expect(createSignupTool.description).toMatch(/table/);
    expect(createSignupTool.description).toMatch(/slot.*\bid\b/);
    expect(publishSignupTool.description).toContain('links.public');
  });

  it('says what a create_signup result without fields and slots means', () => {
    expect(createSignupTool.description).toMatch(/note instead of fields and slots/);
    expect(createSignupTool.description).toContain('get_signup with its id');
    expect(createSignupTool.description).toContain('do not create it again');
  });

  it('delete_signup returns the signup with an explicit deleted flag', async () => {
    const deletedAt = new Date('2026-09-20T00:00:00.000Z');
    svc.deleteSignup.mockResolvedValueOnce(ok({ ...row, deletedAt }));
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({ name: 'delete_signup', arguments: { signupId: 'sig_1' } });
    expect(r.structuredContent).toEqual({
      signup: expect.objectContaining({ id: 'sig_1', status: 'draft' }),
      deleted: true,
      deletedAt: '2026-09-20T00:00:00.000Z',
    });
    expect((r.structuredContent as { signup: Record<string, unknown> }).signup).not.toHaveProperty('links');
  });

  it('a wrong-state transition surfaces the conflict with its suggestion', async () => {
    svc.publishSignup.mockResolvedValueOnce(
      err(
        serviceError('conflict', 'signup is open', {
          field: 'status',
          received: 'open',
          expected: 'draft',
          suggestion: 'it is already published',
        }),
      ),
    );
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({ name: 'publish_signup', arguments: { signupId: 'sig_1' } });
    expect(r.structuredContent).toEqual({
      error: {
        code: 'conflict',
        message: 'signup is open',
        field: 'status',
        received: 'open',
        expected: 'draft',
        suggestion: 'it is already published',
      },
    });
  });
});
