import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

// POST — admin changes a user's login email. Takes effect immediately
// (auto-confirmed); the user signs in with the new email from then on.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((caller as { role?: string } | null)?.role !== "admin") {
      return NextResponse.json({ error: "Only admins can change emails" }, { status: 403 });
    }

    const { user_id, email } = await req.json() as { user_id: string; email: string };
    const clean = (email || "").trim().toLowerCase();
    if (!user_id || !clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return NextResponse.json({ error: "Valid user_id and email required" }, { status: 400 });
    }

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Update the auth account (auto-confirm so it works immediately)
    const { error: authErr } = await svc.auth.admin.updateUserById(user_id, {
      email: clean,
      email_confirm: true,
    });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

    // Keep the profile row in sync
    const { error: profErr } = await svc.from("profiles").update({ email: clean }).eq("id", user_id);
    if (profErr) return NextResponse.json({ error: `Auth updated but profile sync failed: ${profErr.message}` }, { status: 500 });

    return NextResponse.json({ success: true, email: clean });
  } catch (err: unknown) {
    console.error("update-email error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
