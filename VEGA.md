# Vega — changes on top of wacrm

Vega is a fork of [wacrm](https://github.com/ArnasDon/wacrm) (MIT) run as a multi-client service:
Vega's platform admin creates an account for each business, and each business only sees its own
data. Everything else in wacrm works as upstream.

## 1. Invitation-only accounts (migration 047)

- **Public sign-up is closed in the database.** A `BEFORE INSERT` trigger on `auth.users` only lets
  a user be created when:
  1. they were invited through Supabase's invite flow (the Vega admin panel, or *Invite user* in
     the Supabase dashboard), or
  2. they sign up from a valid team invitation link (`/join/<token>`), or
  3. `platform_settings.allow_public_signup` is `true` (first-setup escape hatch, `false` by default).
- The signup page without an invitation explains that accounts are created by Vega.
- A client's account is named after the business the admin typed (`account_name` metadata).

## 2. Platform admin panel (`/admin`)

- Admins are the emails in the server-only env var `PLATFORM_ADMIN_EMAILS`
  (comma separated). Non-admins get 404 from the API and "page doesn't exist" in the UI.
- **New client:** business name + owner email → Supabase emails the owner an invitation →
  they set their own password on `/reset-password` → their account is created with the business
  name, with them as owner. They can then invite their team from Settings.
- **Client list:** every account with owner, number of users and WhatsApp status.

## Setup checklist (Supabase)

1. Run all migrations (`supabase/migrations`, in order), including `047_vega_invite_only_signup.sql`.
2. Environment variables (hosting provider):
   - Everything in `.env.example` from wacrm, plus
   - `PLATFORM_ADMIN_EMAILS=vic.gar.amb@gmail.com`
   - `NEXT_PUBLIC_SITE_URL=https://<your app domain>`
3. **Authentication → Email Templates → Invite user**: replace the link with
   ```html
   <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/reset-password">Create your password</a>
   ```
   (Same pattern wacrm documents for the other templates in `docs/auth-emails.md`.)
4. **Authentication → URL Configuration**: Site URL = your app domain; add
   `https://<your app domain>/auth/callback` to Redirect URLs.
5. **First admin account:** Supabase dashboard → Authentication → Users → **Invite user** with
   your email. (Plain "Add user" is blocked by the invite-only rule on purpose.)

## Tests

- `src/lib/vega/invite-only-signup.test.ts` runs migration 047 on an in-memory Postgres (PGlite).
- `src/lib/vega/platform-admin.test.ts`, `src/app/api/admin/clients/route.test.ts`.
- Note: `src/lib/dashboard/date-utils.test.ts` (upstream) depends on the machine time zone; run the
  suite with `TZ=UTC npm test`.

## Next

- Connect numbers with Meta Embedded Signup + coexistence (needs Meta app approval).
- Pause the bot when the business replies from the WhatsApp Business app (coexistence echoes).
- Default qualification flow for every new client (name → business → need → weekly volume →
  booking link), with priority and lead source.
- Vega branding and Spanish as the default language.
