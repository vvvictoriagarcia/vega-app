// GET /api/admin/me — tells the UI whether to show the Vega admin panel.
// The admin list itself (PLATFORM_ADMIN_EMAILS) never leaves the server.
import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/vega/platform-admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return NextResponse.json({ isAdmin: !!user && isPlatformAdmin(user.email) });
}
