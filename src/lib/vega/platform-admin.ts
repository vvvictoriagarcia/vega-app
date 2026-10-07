// ============================================================
// Vega platform admin — who may create client accounts.
//
// Platform admins are listed by email in the server-only env var
// PLATFORM_ADMIN_EMAILS (comma or whitespace separated). It is never
// exposed to the browser: the client asks /api/admin/me.
//
// Pure helpers only — no Supabase here, so they are easy to test.
// ============================================================

export function parseAdminEmails(raw: string | undefined | null): Set<string> {
  return new Set(
    String(raw ?? '')
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@')),
  );
}

export function isPlatformAdmin(
  email: string | undefined | null,
  raw: string | undefined | null = process.env.PLATFORM_ADMIN_EMAILS,
): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).has(email.trim().toLowerCase());
}

export interface NewClientInput {
  businessName: string;
  ownerEmail: string;
}

export type ValidationResult =
  | { ok: true; value: NewClientInput }
  | { ok: false; error: 'business_name' | 'owner_email' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates the "new client" form: business name (2–120 chars) and owner email. */
export function validateNewClient(body: unknown): ValidationResult {
  const b = (body ?? {}) as Record<string, unknown>;
  const businessName = typeof b.businessName === 'string' ? b.businessName.trim().replace(/\s+/g, ' ') : '';
  const ownerEmail = typeof b.ownerEmail === 'string' ? b.ownerEmail.trim().toLowerCase() : '';
  if (businessName.length < 2 || businessName.length > 120) return { ok: false, error: 'business_name' };
  if (ownerEmail.length > 254 || !EMAIL_RE.test(ownerEmail)) return { ok: false, error: 'owner_email' };
  return { ok: true, value: { businessName, ownerEmail } };
}

/** Where the invite email sends the new owner: set a password, then into the app. */
export function inviteRedirectUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/+$/, '')}/auth/callback?next=${encodeURIComponent('/reset-password')}`;
}
