import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// GET /api/reports/summary?month=YYYY-MM
// Service-role fetch so reports always see full data regardless of RLS.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const month = req.nextUrl.searchParams.get("month") || "";

  const svc = createServiceRoleClient();
  const [leadsRes, expensesRes, salaryRes] = await Promise.all([
    svc
      .from("leads")
      .select("*, vertical:verticals(name,color), our_poc:profiles!leads_our_poc_id_fkey(full_name)")
      .eq("status", "approved")
      .order("updated_at", { ascending: false }),
    month
      ? svc.from("expenses").select("*, vertical:verticals(name,color)").eq("month", month)
      : Promise.resolve({ data: [], error: null }),
    month
      ? svc.from("salary_entries").select("amount, member_type, vertical_id").eq("month", month)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const salaryEntries = (salaryRes.data || []) as { amount: number; member_type: string; vertical_id?: string }[];
  const salaryTotal = salaryEntries.reduce((s, e) => s + Number(e.amount || 0), 0);

  return NextResponse.json({
    leads: leadsRes.data || [],
    expenses: expensesRes.data || [],
    salaryEntries,
    salaryTotal,
  });
}
