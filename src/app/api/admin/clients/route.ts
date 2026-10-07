// ============================================================
// /api/admin/clients — Vega platform admin only.
//
// GET  → every client account with its owner, team size and
//        WhatsApp connection status.
// POST → creates a client: invites the owner by email with the
//        business name. Supabase sends the invite; when the owner
//        accepts, the signup trigger creates their account named
//        after the business (migration 047) and they set a password
//        on /reset-password. The admin never sees or sets passwords.
//
// Non-admins get 404, so the route doesn't reveal it exists.
// ============================================================

import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { vegaAdminClient } from '@/lib/vega/admin-client';
import {
  inviteRedirectUrl,
  isPlatformAdmin,
  validateNewClient,
} from '@/lib/vega/platform-admin';

export const dynamic = 'force-dynamic';

async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user.email)) return null;
  return user;
}

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export interface AdminClientRow {
  id: string;
  name: string;
  ownerEmail: string | null;
  members: number;
  whatsapp: 'connected' | 'disconnected' | 'none';
  createdAt: string;
}

export async function GET() {
  if (!(await requirePlatformAdmin())) return notFound();
  const admin = vegaAdminClient();

  const [accounts, profiles, configs] = await Promise.all([
    admin.from('accounts').select('id, name, owner_user_id, created_at').order('created_at', { ascending: false }).limit(500),
    admin.from('profiles').select('user_id, email, account_id').limit(5000),
    admin.from('whatsapp_config').select('account_id, status').limit(500),
  ]);
  const err = accounts.error || profiles.error || configs.error;
  if (err) {
    console.error('[admin/clients] list failed:', err);
    return NextResponse.json({ error: 'List failed' }, { status: 500 });
  }

  const people = profiles.data ?? [];
  const rows: AdminClientRow[] = (accounts.data ?? []).map((a) => {
    const members = people.filter((p) => p.account_id === a.id);
    const owner = people.find((p) => p.user_id === a.owner_user_id);
    const cfg = (configs.data ?? []).find((c) => c.account_id === a.id);
    return {
      id: a.id,
      name: a.name,
      ownerEmail: owner?.email ?? null,
      members: members.length,
      whatsapp: cfg ? (cfg.status === 'connected' ? 'connected' : 'disconnected') : 'none',
      createdAt: a.created_at,
    };
  });
  return NextResponse.json({ clients: rows });
}

export async function POST(request: Request) {
  if (!(await requirePlatformAdmin())) return notFound();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = validateNewClient(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const { data, error } = await vegaAdminClient().auth.admin.inviteUserByEmail(parsed.value.ownerEmail, {
    data: { account_name: parsed.value.businessName },
    redirectTo: inviteRedirectUrl(siteUrl),
  });

  if (error) {
    // Supabase answers 422 / "already been registered" for an existing user.
    if (error.status === 422 || /already.*registered|already exists/i.test(error.message)) {
      return NextResponse.json({ error: 'already_registered' }, { status: 409 });
    }
    console.error('[admin/clients] invite failed:', error);
    return NextResponse.json({ error: 'invite_failed' }, { status: 502 });
  }

  return NextResponse.json({ invited: true, userId: data.user?.id ?? null }, { status: 201 });
}
