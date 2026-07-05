import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// GET — pending leave applications the current user can act on:
// admins see all; reporting managers see their direct reports' requests.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceRoleClient();
  const { data: me } = await svc.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = (me as { role?: string } | null)?.role === "admin";

  const { data: reports } = await svc.from("profiles").select("id").eq("reporting_manager_id", user.id);
  const reportIds = (reports || []).map(r => (r as { id: string }).id);

  if (!isAdmin && reportIds.length === 0) return NextResponse.json({ data: [] });

  let q = svc.from("leave_applications")
    .select("id, user_id, leave_type, from_date, to_date, days, reason, status, profiles:user_id(full_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (!isAdmin) q = q.in("user_id", reportIds);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [], isAdmin });
}
