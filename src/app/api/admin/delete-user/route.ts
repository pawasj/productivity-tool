import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    // Caller must be an admin
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((caller as { role?: string } | null)?.role !== "admin") {
      return NextResponse.json({ error: "Only admins can remove users" }, { status: 403 });
    }

    const { user_id } = await req.json() as { user_id: string };
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });
    if (user_id === user.id) return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Delete profile row first (keeps FK references tidy), then the auth user
    await adminClient.from("profiles").delete().eq("id", user_id);
    const { error } = await adminClient.auth.admin.deleteUser(user_id);
    if (error && !/not found/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("delete-user error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
