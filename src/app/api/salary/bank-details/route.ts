import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// GET /api/salary/bank-details?user_id=… — fetch a team member's bank details
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = req.nextUrl.searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from("employee_bank_details")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST — add/update bank details for a team member
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    user_id: string;
    account_holder_name?: string;
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    upi_id?: string;
  };
  if (!body.user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const svc = createServiceRoleClient();
  const { error } = await svc.from("employee_bank_details").upsert({
    user_id: body.user_id,
    account_holder_name: body.account_holder_name || null,
    bank_name: body.bank_name || null,
    account_number: body.account_number || null,
    ifsc_code: body.ifsc_code || null,
    upi_id: body.upi_id || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
