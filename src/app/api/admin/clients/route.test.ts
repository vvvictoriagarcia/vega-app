import { beforeEach, describe, expect, it, vi } from 'vitest';

// The signed-in user, as the server Supabase client reports it.
let currentUser: { id: string; email: string } | null = null;
const invites: Array<{ email: string; options: Record<string, unknown> }> = [];
let inviteError: { status?: number; message: string } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}));

const tables: Record<string, unknown[]> = {
  accounts: [
    { id: 'a1', name: 'Inmobiliaria', owner_user_id: 'u1', created_at: '2026-10-07T10:00:00Z' },
    { id: 'a2', name: 'Bar Central', owner_user_id: 'u3', created_at: '2026-10-06T10:00:00Z' },
  ],
  profiles: [
    { user_id: 'u1', email: 'duenio@inmo.com', account_id: 'a1' },
    { user_id: 'u2', email: 'equipo@inmo.com', account_id: 'a1' },
    { user_id: 'u3', email: 'bar@x.com', account_id: 'a2' },
  ],
  whatsapp_config: [{ account_id: 'a1', status: 'connected' }],
};

vi.mock('@/lib/vega/admin-client', () => ({
  vegaAdminClient: () => ({
    from: (table: string) => {
      const result = { data: tables[table], error: null };
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: () => Promise.resolve(result),
      };
      return chain;
    },
    auth: {
      admin: {
        inviteUserByEmail: async (email: string, options: Record<string, unknown>) => {
          invites.push({ email, options });
          return inviteError ? { data: { user: null }, error: inviteError } : { data: { user: { id: 'new-user' } }, error: null };
        },
      },
    },
  }),
}));

import { GET, POST } from './route';

const post = (body: unknown) =>
  POST(new Request('https://app.test/api/admin/clients', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  process.env.PLATFORM_ADMIN_EMAILS = 'vic@vega.com';
  process.env.NEXT_PUBLIC_SITE_URL = 'https://app.vega.com';
  currentUser = { id: 'admin', email: 'Vic@Vega.com' };
  invites.length = 0;
  inviteError = null;
});

describe('/api/admin/clients', () => {
  it('returns 404 to signed-out users and to non-admins, and invites nobody', async () => {
    currentUser = null;
    expect((await GET()).status).toBe(404);
    currentUser = { id: 'u1', email: 'duenio@inmo.com' };
    expect((await GET()).status).toBe(404);
    expect((await post({ businessName: 'X Corp', ownerEmail: 'x@x.com' })).status).toBe(404);
    expect(invites).toHaveLength(0);
  });

  it('lists clients with owner, team size and WhatsApp status', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const { clients } = await res.json();
    expect(clients).toEqual([
      { id: 'a1', name: 'Inmobiliaria', ownerEmail: 'duenio@inmo.com', members: 2, whatsapp: 'connected', createdAt: '2026-10-07T10:00:00Z' },
      { id: 'a2', name: 'Bar Central', ownerEmail: 'bar@x.com', members: 1, whatsapp: 'none', createdAt: '2026-10-06T10:00:00Z' },
    ]);
  });

  it('invites the owner with the business name and the set-password redirect', async () => {
    const res = await post({ businessName: ' Bar  Central ', ownerEmail: 'Bar@X.com' });
    expect(res.status).toBe(201);
    expect(invites).toEqual([
      {
        email: 'bar@x.com',
        options: {
          data: { account_name: 'Bar Central' },
          redirectTo: 'https://app.vega.com/auth/callback?next=%2Freset-password',
        },
      },
    ]);
  });

  it('rejects an invalid form without inviting', async () => {
    const res = await post({ businessName: 'B', ownerEmail: 'bar@x.com' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'business_name' });
    expect(invites).toHaveLength(0);
  });

  it('reports an email that already has an account as 409', async () => {
    inviteError = { status: 422, message: 'A user with this email address has already been registered' };
    const res = await post({ businessName: 'Bar Central', ownerEmail: 'bar@x.com' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'already_registered' });
  });
});
