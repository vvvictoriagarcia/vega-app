import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Service-role client for the Vega platform-admin routes. Mirrors
// src/lib/ai/admin-client.ts. Only ever used server-side, after the
// caller has been checked with isPlatformAdmin().
let _client: SupabaseClient | null = null;

export function vegaAdminClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _client;
}
