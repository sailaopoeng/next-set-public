import { NextResponse } from "next/server";

import { isAllowedEmail } from "@/lib/auth/allowed-user";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile } from "@/server/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !isAllowedEmail(user.email)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=email_not_allowed", url));
    }

    await ensureProfile(supabase, user);
  }

  return NextResponse.redirect(new URL(next, url));
}
