import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// Notifies the other party when a reimbursement claim changes hands.
// Uses the service role because the notifications RLS policy is
// `user_id = auth.uid()`, which blocks writing a row for someone else.
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { event, reimbursement_id } = await req.json();
  if (!reimbursement_id || !["submitted", "approved", "rejected"].includes(event)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const svc = createServiceRoleClient();

  const { data: claim } = await svc
    .from("reimbursements")
    .select("id, user_id, amount, expense_type, expense_date, approver_id")
    .eq("id", reimbursement_id)
    .single();
  if (!claim) return NextResponse.json({ error: "Claim not found" }, { status: 404 });

  const { data: actor } = await svc.from("profiles").select("full_name").eq("id", user.id).single();
  const actorName = actor?.full_name || "Someone";
  const amount = `₹${Number(claim.amount || 0).toLocaleString("en-IN")}`;
  const dateLabel = new Date(claim.expense_date + "T00:00:00")
    .toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  let recipientId: string | null = null;
  let title = "";
  let body = "";

  if (event === "submitted") {
    // Route to the claimant's reporting manager; fall back to admins.
    const { data: claimant } = await svc
      .from("profiles").select("full_name, reporting_manager_id").eq("id", claim.user_id).single();
    recipientId = claim.approver_id || claimant?.reporting_manager_id || null;
    title = "Reimbursement needs approval";
    body = `${claimant?.full_name || actorName} claimed ${amount} (${claim.expense_type}, ${dateLabel})`;

    if (!recipientId) {
      const { data: admins } = await svc.from("profiles").select("id").eq("role", "admin");
      const rows = (admins || []).map(a => ({
        user_id: a.id, type: "info", title, body,
        link: "/dashboard/profile", read: false,
      }));
      if (rows.length) {
        const { error } = await svc.from("notifications").insert(rows);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, notified: rows.length });
    }
  } else {
    // Approval decisions go back to the person who raised the claim.
    recipientId = claim.user_id;
    const approved = event === "approved";
    title = approved ? "Reimbursement approved" : "Reimbursement rejected";
    body = approved
      ? `${actorName} approved ${amount} — it will appear in Salary & Payouts`
      : `${actorName} rejected your ${amount} claim (${claim.expense_type}, ${dateLabel})`;
  }

  const { error } = await svc.from("notifications").insert({
    user_id: recipientId,
    type: "info",
    title,
    body,
    link: "/dashboard/profile",
    read: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, notified: 1 });
}
