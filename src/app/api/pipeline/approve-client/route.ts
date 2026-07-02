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
    updated_at: new Date().toISOString(),
  };

  // Manual upsert on lead_id — does not rely on a unique constraint existing
  const { data: existing } = await svc.from("clients").select("id").eq("lead_id", lead.id).maybeSingle();
  if (existing) {
    const { error } = await svc.from("clients").update(payload).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ client_id: existing.id, created: false });
  }

  const { data: created, error } = await svc
    .from("clients")
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client_id: created.id, created: true });
}
