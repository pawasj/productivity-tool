import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// POST /api/pipeline/approve-client — when a lead is approved, create/update
// the corresponding entry in the clients table with details pre-filled.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { lead_id, brief_id } = await req.json() as { lead_id?: string; brief_id?: string };
  if (!lead_id && !brief_id) {
    return NextResponse.json({ error: "lead_id or brief_id required" }, { status: 400 });
  }

  const svc = createServiceRoleClient();

  function monthOf(iso?: string | null) {
    const d = iso ? new Date(iso) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  let payload: Record<string, unknown>;
  let matchColumn: "lead_id" | "name";
  let matchValue: string;

  if (lead_id) {
    const { data: lead, error: leadErr } = await svc.from("leads").select("*").eq("id", lead_id).single();
    if (leadErr || !lead) return NextResponse.json({ error: leadErr?.message || "Lead not found" }, { status: 404 });

    // The engagement's month is when the lead was approved, not when this row
    // happens to be written — a one-time deal must report in its approval month.
    payload = {
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
      start_month: monthOf(lead.approved_at),
      updated_at: new Date().toISOString(),
    };
    matchColumn = "lead_id";
    matchValue = lead.id;
  } else {
    // Approved briefs from the Distribution Hub are real engagements too —
    // they have no lead row, so they are matched on brand name instead.
    const { data: brief, error: briefErr } = await svc.from("client_briefs").select("*").eq("id", brief_id!).single();
    if (briefErr || !brief) return NextResponse.json({ error: briefErr?.message || "Brief not found" }, { status: 404 });

    const isRetainer = brief.engagement_type === "retainer";
    const value = brief.total_budget || brief.budget || 0;
    payload = {
      name: brief.brand_name,
      contact_name: brief.brand_poc || brief.poc_name || null,
      engagement_type: isRetainer ? "retainer" : "one_time",
      amount: isRetainer ? 0 : value,
      monthly_value: isRetainer ? value : 0,
      deliverables: brief.brief || "",
      vertical_id: brief.vertical_id || null,
      status: "active",
      start_month: monthOf(brief.updated_at || brief.created_at),
      updated_at: new Date().toISOString(),
    };
    matchColumn = "name";
    matchValue = brief.brand_name;
  }

  // start_month arrived in a later migration. If it has not been applied yet
  // Postgres rejects the whole row, which would silently lose the client — so
  // drop the column and retry rather than fail the approval.
  function isMissingColumn(msg: string) {
    return /start_month|schema cache|column .* does not exist/i.test(msg);
  }
  function withoutStartMonth(p: Record<string, unknown>) {
    const { start_month, ...rest } = p;
    void start_month;
    return rest;
  }

  // Manual upsert — does not rely on a unique constraint existing
  const { data: existing } = await svc.from("clients").select("id").eq(matchColumn, matchValue).maybeSingle();
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
