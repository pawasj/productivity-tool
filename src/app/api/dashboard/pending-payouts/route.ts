import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// GET /api/dashboard/pending-payouts — approved reimbursements not yet paid.
// Admin-only: this is company-wide payout exposure, not a personal view.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: [] });

  const svc = createServiceRoleClient();
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ data: [] });

  const { data, error } = await svc
    .from("reimbursements")
    .select("id, amount, expense_type, expense_date, month, approved_at, profiles:user_id(full_name)")
    .eq("status", "approved")
    .eq("paid", false)
    .order("approved_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ data: [], error: error.message });

  const rows = data || [];
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  return NextResponse.json({ data: rows, total, count: rows.length });
}
