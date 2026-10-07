// Runs migration 047 against a real (in-memory) Postgres with a minimal
// stand-in for Supabase's auth.users and the account tables it touches.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/047_vega_invite_only_signup.sql'),
  'utf8',
);
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

let db: PGlite;
let accountId: string;

const signUp = (email: string, invited: boolean, meta: Record<string, unknown> = {}) =>
  db.query<{ id: string }>(
    'INSERT INTO auth.users (email, invited_at, raw_user_meta_data) VALUES ($1, $2, $3) RETURNING id',
    [email, invited ? new Date().toISOString() : null, JSON.stringify(meta)],
  );
const accountOf = async (userId: string) =>
  (
    await db.query<{ name: string; account_role: string }>(
      'SELECT a.name, p.account_role FROM accounts a JOIN profiles p ON p.account_id = a.id WHERE p.user_id = $1',
      [userId],
    )
  ).rows[0];
const addInvite = (token: string, expiresSql: string, accepted = false) =>
  db.query(
    `INSERT INTO account_invitations (account_id, token_hash, role, expires_at, accepted_at)
     VALUES ($1, $2, 'agent', ${expiresSql}, ${accepted ? 'now()' : 'NULL'})`,
    [accountId, sha(token)],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text,
      invited_at timestamptz, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE TYPE account_role_enum AS ENUM ('owner','admin','agent','viewer');
    CREATE TABLE accounts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, owner_user_id uuid NOT NULL);
    CREATE TABLE profiles (user_id uuid PRIMARY KEY, full_name text, email text, account_id uuid, account_role account_role_enum);
    CREATE TABLE account_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL,
      token_hash text NOT NULL UNIQUE, role account_role_enum NOT NULL, expires_at timestamptz NOT NULL, accepted_at timestamptz);
  `);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // idempotent
  await db.exec(
    'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();',
  );
  const owner = (await signUp('owner@inmo.com', true, { account_name: 'Seed' })).rows[0].id;
  accountId = (await db.query<{ id: string }>('SELECT account_id AS id FROM profiles WHERE user_id = $1', [owner])).rows[0].id;
});

describe('migration 047: invite-only signup', () => {
  it('rejects a public sign-up', async () => {
    await expect(signUp('stranger@x.com', false, { full_name: 'Stranger' })).rejects.toThrow(/invite_only_signup/);
  });

  it('accepts an admin invite and names the account after the business', async () => {
    const id = (await signUp('duenio@bar.com', true, { account_name: '  Bar Central ' })).rows[0].id;
    expect(await accountOf(id)).toEqual({ name: 'Bar Central', account_role: 'owner' });
  });

  it('falls back to the email when no name is given', async () => {
    const id = (await signUp('noname@x.com', true)).rows[0].id;
    expect((await accountOf(id)).name).toBe('noname@x.com');
  });

  it('accepts a teammate with a pending, unexpired invitation token', async () => {
    const token = newToken();
    await addInvite(token, "now() + interval '7 days'");
    await expect(signUp('ana@inmo.com', false, { invite_token: token })).resolves.toBeTruthy();
  });

  it('rejects unknown, expired and already-used tokens', async () => {
    await expect(signUp('x1@x.com', false, { invite_token: newToken() })).rejects.toThrow(/invite_only_signup/);
    const expired = newToken();
    await addInvite(expired, "now() - interval '1 day'");
    await expect(signUp('x2@x.com', false, { invite_token: expired })).rejects.toThrow(/invite_only_signup/);
    const used = newToken();
    await addInvite(used, "now() + interval '1 day'", true);
    await expect(signUp('x3@x.com', false, { invite_token: used })).rejects.toThrow(/invite_only_signup/);
  });

  it('honours the allow_public_signup escape hatch', async () => {
    await db.query(`UPDATE platform_settings SET value = 'true'::jsonb WHERE key = 'allow_public_signup'`);
    await expect(signUp('open@x.com', false)).resolves.toBeTruthy();
    await db.query(`UPDATE platform_settings SET value = 'false'::jsonb WHERE key = 'allow_public_signup'`);
    await expect(signUp('closed@x.com', false)).rejects.toThrow(/invite_only_signup/);
  });

  it('keeps the gate function out of reach of anon users', async () => {
    const r = await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege('anon', 'public.enforce_invite_only_signup()', 'EXECUTE') AS ok`,
    );
    expect(r.rows[0].ok).toBe(false);
  });
});
