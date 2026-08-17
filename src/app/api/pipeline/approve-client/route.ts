import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// POST /api/pipeline/approve-client — when a lead is approved, create/update
// the corresponding entry in the clients table with details pre-filled.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lead_id } = await req.json() as { lead_id: string };
  if (!lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  const svc = createServiceRoleClient();
  const { data: lead, error: leadErr } = await svc.from("leads").select("*").eq("id", lead_id).single();
  if (leadErr || !lead) return NextResponse.json({ error: leadErr?.message || "Lead not found" }, { status: 404 });

  // The engagement's month is when the lead was approved, not when this row
  // happens to be written — a one-time deal must report in its approval month.
  const approvedAt = lead.approved_at ? new Date(lead.approved_at) : new Date();
  const startMonth = `${approvedAt.getFullYear()}-${String(approvedAt.getMonth() + 1).padStart(2, "0")}`;

  const payload = {
    lead_id: lead.id,
    name: lead.company_name,
    contact_name: lead.contact_name || null,
    contact_email: lead.contact_email || null,
    contact_phone: lead.contact_phone || null,
    engagement_type: lead.engagement_type === "retainer" ? "retainer" : "one_time",
    amount: lead.deal_value || 0,
    monthly_value: lead.monthly_value || 0,
    deliverables: lead.notes || "",
    vertical_id: lead.vertical_id || null,
    status: "active",
    start_month: startMonth,
    updated_at: new Date().toISOString(),
  };

  // start_month arrived in a later migration. If it has not been applied yet
  // Postgres rejects the whole row, which would silently lose the client — so
  // drop the column and retry rather than fail the approval.
  function isMissingColumn(msg: string) {
    return /start_month|schema cache|column .* does not exist/i.test(msg);
  }
  function withoutStartMonth(p: typeof payload) {
    const { start_month, ...rest } = p;
    void start_month;
    return rest;
  }

  // Manual upsert on lead_id — does not rely on a unique constraint existing
  const { data: existing } = await svc.from("clients").select("id").eq("lead_id", lead.id).maybeSingle();
  if (existing) {
    let { error } = await svc.from("clients").update(payload).eq("id", existing.id);
    if (error && isMissingColumn(error.message)) {
      ({ error } = await svc.from("clients").update(withoutStartMonth(payload)).eq("id", existing.id));
      if (!error) return NextResponse.json({ client_id: existing.id, created: false, degraded: "start_month" });
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ client_id: existing.id, created: false });
  }

  const insert = (body: Record<string, unknown>) =>
    svc.from("clients").insert({ ...body, created_at: new Date().toISOString() }).select("id").single();

  let { data: created, error } = await insert(payload);
  if (error && isMissingColumn(error.message)) {
    ({ data: created, error } = await insert(withoutStartMonth(payload)));
    if (!error && created) {
      return NextResponse.json({ client_id: created.id, created: true, degraded: "start_month" });
    }
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client_id: created!.id, created: true });
}
