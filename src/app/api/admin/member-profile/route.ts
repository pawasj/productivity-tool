import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// GET /api/admin/member-profile?user_id=… — everything a member has filled in.
// Admin-only: profile, personal details, bank details, documents, leaves.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if ((caller as { role?: string } | null)?.role !== "admin") {
    return NextResponse.json({ error: "Admins only" }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const svc = createServiceRoleClient();
  const [profileRes, detailsRes, bankRes, docsRes, leavesRes] = await Promise.all([
    svc.from("profiles").select("*").eq("id", userId).single(),
    svc.from("employee_details").select("*").eq("user_id", userId).maybeSingle(),
    svc.from("employee_bank_details").select("*").eq("user_id", userId).maybeSingle(),
    svc.from("employee_documents").select("*").eq("user_id", userId).order("uploaded_at", { ascending: false }),
    svc.from("leave_applications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    profile: profileRes.data || null,
    details: detailsRes.data || null,
    bank: bankRes.data || null,
    documents: docsRes.data || [],
    leaves: leavesRes.data || [],
  });
}
