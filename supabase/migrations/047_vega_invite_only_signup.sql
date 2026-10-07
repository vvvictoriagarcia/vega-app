-- ============================================================
-- 047_vega_invite_only_signup.sql — Vega: accounts are created by
-- the platform admin, never by public sign-up.
--
-- Who may create an auth user after this migration
--   1. Anyone invited through Supabase's invite flow
--      (`auth.admin.inviteUserByEmail` from the Vega admin panel, or
--      "Invite user" in the Supabase dashboard). GoTrue sets
--      `invited_at` on the row it inserts, which public sign-up never
--      does.
--   2. A teammate signing up from a valid team invitation link
--      (`/join/<token>`): the signup page sends the token in the user
--      metadata as `invite_token`, and it must match a pending,
--      unexpired `account_invitations` row (same SHA-256 hex hash the
--      app stores — see src/lib/auth/invitations.ts).
--   3. Anyone, only while `platform_settings.allow_public_signup` is
--      true (an escape hatch for first setup; off by default).
--
-- Everything else is rejected inside the database, so calling the
-- public Supabase sign-up endpoint directly with the anon key does
-- not get around it. GoTrue surfaces the rejection as
-- "Database error saving new user"; the signup page explains it.
--
-- Also: `handle_new_user` now names the new account from the
-- `account_name` metadata the admin sets when inviting a client
-- (falls back to full name, then email, like before).
--
-- Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- Platform settings (service role only: RLS on, no policies)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

INSERT INTO public.platform_settings (key, value)
VALUES ('allow_public_signup', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- Gate: BEFORE INSERT on auth.users
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_invite_only_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
  v_public BOOLEAN;
BEGIN
  -- 1. Invited by an admin (Supabase invite flow).
  IF NEW.invited_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Team invitation link with a valid, pending token.
  v_token := NEW.raw_user_meta_data->>'invite_token';
  IF v_token IS NOT NULL
     AND length(v_token) BETWEEN 16 AND 256
     AND EXISTS (
       SELECT 1
       FROM public.account_invitations i
       WHERE i.token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
         AND i.accepted_at IS NULL
         AND i.expires_at > NOW()
     ) THEN
    RETURN NEW;
  END IF;

  -- 3. Escape hatch for first setup.
  SELECT (value #>> '{}')::boolean INTO v_public
  FROM public.platform_settings
  WHERE key = 'allow_public_signup';
  IF COALESCE(v_public, false) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invite_only_signup'
    USING ERRCODE = 'P0001',
          HINT = 'Accounts are created by invitation only.';
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_invite_only_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_invite_only_signup ON auth.users;
CREATE TRIGGER enforce_invite_only_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invite_only_signup();

-- ------------------------------------------------------------
-- Account name from the admin's invite
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  v_account_name := left(btrim(COALESCE(NEW.raw_user_meta_data->>'account_name', '')), 120);

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (
    COALESCE(NULLIF(v_account_name, ''), NULLIF(v_full_name, ''), NEW.email, 'My account'),
    NEW.id
  )
  RETURNING id INTO v_account_id;

  INSERT INTO public.profiles (user_id, full_name, email, account_id, account_role)
  VALUES (NEW.id, v_full_name, NEW.email, v_account_id, 'owner');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account/profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
