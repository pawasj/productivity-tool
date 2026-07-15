import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// POST /api/followups/check — create reminder notifications for follow-ups
// that are due today or overdue. Called when the notification bell loads.
// Deduped: one reminder per item per follow-up date.
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const svc = createServiceRoleClient();

  const [{ data: leads }, { data: briefs }, { data: dueTodos }] = await Promise.all([
    svc.from("leads")
      .select("id, company_name, next_follow_up, our_poc_id, status")
      .not("next_follow_up", "is", null)
      .lte("next_follow_up", today)
      .not("status", "in", "(completed,lost)"),
    svc.from("client_briefs")
      .select("id, brand_name, next_follow_up, created_by, status")
      .not("next_follow_up", "is", null)
      .lte("next_follow_up", today)
      .not("status", "in", "(completed,lost)"),
    svc.from("todos")
      .select("id, title, due_date, user_id, assigned_to, kind")
      .eq("completed", false)
      .not("due_date", "is", null)
      .lte("due_date", today),
  ]);

  const candidates: Array<{ user_id: string; ref: string; name: string; due: string }> = [];
  for (const l of (leads || []) as Record<string, string>[]) {
    if (l.our_poc_id) candidates.push({ user_id: l.our_poc_id, ref: `lead:${l.id}:${l.next_follow_up}`, name: l.company_name, due: l.next_follow_up });
  }
  for (const b of (briefs || []) as Record<string, string>[]) {
    if (b.created_by) candidates.push({ user_id: b.created_by, ref: `brief:${b.id}:${b.next_follow_up}`, name: b.brand_name, due: b.next_follow_up });
  }
  // Due to-dos and tasks — remind the owner and every assignee
  for (const t of (dueTodos || []) as Array<{ id: string; title: string; due_date: string; user_id: string; assigned_to?: string[] | null; kind?: string }>) {
    const recipients = new Set<string>([t.user_id, ...(t.assigned_to || [])]);
    for (const uid of recipients) {
      if (uid) candidates.push({ user_id: uid, ref: `todo:${t.id}:${t.due_date}`, name: t.title, due: t.due_date });
    }
  }
  if (candidates.length === 0) return NextResponse.json({ created: 0 });

  // Dedup against already-sent reminders (ref stored in the message tail)
  const { data: existing } = await svc
    .from("notifications")
    .select("message")
    .eq("type", "follow_up")
    .in("user_id", Array.from(new Set(candidates.map(c => c.user_id))));
  const sent = new Set((existing || []).map(n => {
    const m = String((n as { message: string }).message).match(/\[(lead|brief|todo):[^\]]+\]$/);
    return m ? m[0] : "";
  }));

  const fresh = candidates.filter(c => !sent.has(`[${c.ref}]`));
  if (fresh.length === 0) return NextResponse.json({ created: 0 });

  await svc.from("notifications").insert(fresh.map(c => ({
    user_id: c.user_id,
    type: "follow_up",
    title: "Follow-up reminder",
    message: `Follow up with ${c.name} — due ${new Date(c.due).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} [${c.ref}]`,
    is_read: false,
    created_at: new Date().toISOString(),
  })));

  return NextResponse.json({ created: fresh.length });
}
