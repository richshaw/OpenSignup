import { beforeEach, describe, expect, it, vi } from 'vitest';
import { serviceError } from '@/lib/errors';
import { err, ok } from '@/lib/result';
import { connectTestClient } from '../testing/client';
import { signupRow, unitContext } from '../testing/fixtures';
import { getSignup, listSignups } from './signups-read';
import { listWorkspaces } from './workspaces';

const READ_TOOLS = [listWorkspaces, listSignups, getSignup];

const listSignupsForWorkspace = vi.fn();
const getSignupForOrganizer = vi.fn();
vi.mock('@/services/signups', () => ({
  listSignupsForWorkspace: (...a: unknown[]) => listSignupsForWorkspace(...a),
  getSignupForOrganizer: (...a: unknown[]) => getSignupForOrganizer(...a),
}));
vi.mock('@/mcp/links', () => ({
  signupLinks: (r: { id: string; slug: string }) => ({
    edit: `https://x/app/signups/${r.id}/build`,
    preview: `https://x/app/signups/${r.id}/preview`,
    public: `https://x/s/${r.slug}`,
  }),
}));

const ctx = unitContext({
  actor: {
    kind: 'organizer',
    id: 'org_1',
    email: 'a@example.com',
    workspaceIds: ['ws_1', 'ws_2'],
    workspaceRoles: { ws_1: 'owner', ws_2: 'viewer' },
    via: { clientId: 'c' },
  },
  scopes: ['signups:read'],
  workspaces: [
    { id: 'ws_1', slug: 'mine', name: 'Mine', role: 'owner' },
    { id: 'ws_2', slug: 'school', name: 'School', role: 'viewer' },
  ],
});

const row = signupRow();

beforeEach(() => {
  listSignupsForWorkspace.mockReset();
  getSignupForOrganizer.mockReset();
});

describe('read tools', () => {
  it('lists the three read tools with read-only annotations', async () => {
    const client = await connectTestClient(ctx, READ_TOOLS);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['list_workspaces', 'list_signups', 'get_signup']));
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.inputSchema.type).toBe('object');
    }
  });

  it('list_workspaces marks the default', async () => {
    const client = await connectTestClient(ctx, READ_TOOLS);
    const r = await client.callTool({ name: 'list_workspaces', arguments: {} });
    expect(r.structuredContent).toEqual({
      workspaces: [
        { id: 'ws_1', slug: 'mine', name: 'Mine', role: 'owner', isDefault: true },
        { id: 'ws_2', slug: 'school', name: 'School', role: 'viewer', isDefault: false },
      ],
    });
  });

  it('list_signups defaults to the default workspace and returns summaries without descriptions', async () => {
    listSignupsForWorkspace.mockResolvedValueOnce(ok([row]));
    const client = await connectTestClient(ctx, READ_TOOLS);
    const r = await client.callTool({ name: 'list_signups', arguments: {} });
    expect(listSignupsForWorkspace).toHaveBeenCalledWith(ctx.db, ctx.actor, 'ws_1', {});
    const body = r.structuredContent as { signups: Record<string, unknown>[] };
    expect(body.signups[0]).toEqual({
      id: 'sig_1',
      slug: 'bake-sale',
      title: 'Bake sale',
      status: 'draft',
      visibility: 'unlisted',
      closesAt: null,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
      links: {
        edit: 'https://x/app/signups/sig_1/build',
        preview: 'https://x/app/signups/sig_1/preview',
        public: 'https://x/s/bake-sale',
      },
    });
    expect(JSON.stringify(body)).not.toContain('Bring cakes');
  });

  it('list_signups passes an explicit workspace and status through', async () => {
    listSignupsForWorkspace.mockResolvedValueOnce(ok([]));
    const client = await connectTestClient(ctx, READ_TOOLS);
    await client.callTool({ name: 'list_signups', arguments: { workspaceId: 'ws_2', status: 'open' } });
    expect(listSignupsForWorkspace).toHaveBeenCalledWith(ctx.db, ctx.actor, 'ws_2', { status: 'open' });
  });

  it('get_signup returns fields, slots with filled counts, and links', async () => {
    getSignupForOrganizer.mockResolvedValueOnce(
      ok({
        ...row,
        fields: [
          { id: 'fld_1', ref: 'what', label: 'What', fieldType: 'text', sortOrder: 0, config: { fieldType: 'text', maxLength: 200 } },
        ],
        slots: [
          {
            id: 'slot_1',
            signupId: 'sig_1',
            workspaceId: 'ws_1',
            values: { what: 'Cake' },
            capacity: 3,
            sortOrder: 0,
            status: 'open',
            slotAt: null,
            createdAt: new Date(0),
            updatedAt: new Date(0),
          },
        ],
        committedBySlot: { slot_1: 2 },
      }),
    );
    const client = await connectTestClient(ctx, READ_TOOLS);
    const r = await client.callTool({ name: 'get_signup', arguments: { signupId: 'sig_1' } });
    expect(getSignupForOrganizer).toHaveBeenCalledWith(ctx.db, ctx.actor, 'sig_1', { includeFilled: true });
    const body = r.structuredContent as {
      signup: Record<string, unknown>;
      slots: Record<string, unknown>[];
      fields: unknown[];
      links: unknown;
    };
    expect(body.signup).toMatchObject({ id: 'sig_1', description: 'Bring cakes', settings: { groupByFieldRefs: [] } });
    expect(body.signup).not.toHaveProperty('links');
    expect(body.slots[0]).toEqual({ id: 'slot_1', values: { what: 'Cake' }, capacity: 3, filled: 2, status: 'open', sortOrder: 0 });
    expect(body.fields).toHaveLength(1);
    expect(body.links).toEqual({
      edit: 'https://x/app/signups/sig_1/build',
      preview: 'https://x/app/signups/sig_1/preview',
      public: 'https://x/s/bake-sale',
    });
  });

  it('get_signup names the links it returns', () => {
    expect(getSignup.description).toContain('links.edit');
    expect(getSignup.description).toContain('links.preview');
    expect(getSignup.description).not.toContain('build page');
  });

  it('a wrong argument type comes back as a structured invalid_input, not the SDK text error', async () => {
    const client = await connectTestClient(ctx, READ_TOOLS);
    const r = await client.callTool({ name: 'get_signup', arguments: { signupId: 5 } });
    expect(r.isError).toBe(true);
    expect((r.structuredContent as { error: { code: string; field?: string } }).error).toMatchObject({
      code: 'invalid_input',
      field: 'signupId',
    });
    expect(getSignupForOrganizer).not.toHaveBeenCalled();
  });

  it('service errors come back as tool errors with the same code', async () => {
    getSignupForOrganizer.mockResolvedValueOnce(err(serviceError('not_found', 'signup not found')));
    const client = await connectTestClient(ctx, READ_TOOLS);
    const r = await client.callTool({ name: 'get_signup', arguments: { signupId: 'sig_9' } });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toEqual({ error: { code: 'not_found', message: 'signup not found' } });
  });
});
