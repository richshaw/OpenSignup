import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceError, ServiceException } from '@/lib/errors';
import { err, ok } from '@/lib/result';
import type { ToolContext } from '../context';
import { connectTestClient } from '../testing/client';
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
vi.mock('@/services/commitments', () => ({ committedBySlot: vi.fn(async () => ({})) }));
const consume = vi.fn(async (..._args: unknown[]) => {});
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, consumeRateLimit: (...a: unknown[]) => consume(...(a as [])) };
});
vi.mock('@/mcp/links', () => ({
  signupLinks: (r: { id: string; slug: string }) => ({ build: `b/${r.id}`, public: `p/${r.slug}` }),
}));

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
  workspaces: [{ id: 'ws_1', slug: 'w', name: 'W', role: 'owner' }],
};
const row = {
  id: 'sig_1',
  slug: 'snack-rota',
  title: 'Snack rota',
  description: '',
  status: 'draft',
  visibility: 'unlisted',
  closesAt: null,
  settings: { groupByFieldRefs: ['date'], sendReminders: true, requireEmail: true },
  createdAt: new Date(0),
  updatedAt: new Date(0),
  workspaceId: 'ws_1',
  organizerId: 'org_1',
  deletedAt: null,
  tags: [],
};

beforeEach(() => {
  for (const f of Object.values(svc)) f.mockReset();
  consume.mockClear();
});

describe('create_signup', () => {
  it('converts the draft, meters the organizer, and creates everything in one call', async () => {
    svc.createSignup.mockResolvedValueOnce(ok(row));
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
    expect(r.structuredContent).toMatchObject({
      signup: { id: 'sig_1', status: 'draft' },
      summary: { fieldsAdded: 2, slotsAdded: 2, groupByFieldRefs: [] },
      warnings: [],
      links: { build: 'b/sig_1', public: 'p/snack-rota' },
    });
  });

  it('reports what it could not keep as warnings', async () => {
    svc.createSignup.mockResolvedValueOnce(ok(row));
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({
      name: 'create_signup',
      arguments: {
        title: 'Snack rota',
        fields: [{ ref: 'date', label: 'Date', fieldType: 'date' }],
        slots: [{ values: { date: 'next saturday' } }],
      },
    });
    expect((r.structuredContent as { warnings: string[] }).warnings.length).toBeGreaterThan(0);
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
  it('merges settings over the current row before calling the service', async () => {
    svc.getSignupForOrganizer.mockResolvedValueOnce(ok({ ...row, slots: [], fields: [] }));
    svc.updateSignup.mockResolvedValueOnce(ok({ ...row, settings: { ...row.settings, sendReminders: false } }));
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    const r = await client.callTool({
      name: 'update_signup',
      arguments: { signupId: 'sig_1', settings: { sendReminders: false } },
    });
    expect(r.isError, JSON.stringify(r.structuredContent)).toBeFalsy();
    expect(svc.updateSignup).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1', {
      settings: { groupByFieldRefs: ['date'], sendReminders: false, requireEmail: true },
    });
  });

  it('passes plain fields through without touching settings', async () => {
    svc.updateSignup.mockResolvedValueOnce(ok({ ...row, title: 'New' }));
    const client = await connectTestClient(ctx, WRITE_TOOLS);
    await client.callTool({ name: 'update_signup', arguments: { signupId: 'sig_1', title: 'New', description: 'Desc' } });
    expect(svc.getSignupForOrganizer).not.toHaveBeenCalled();
    expect(svc.updateSignup).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1', { title: 'New', description: 'Desc' });
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
