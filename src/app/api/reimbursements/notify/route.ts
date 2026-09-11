import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import { sendEmail, emailShell, FINANCE_EMAIL } from "@/lib/mailer";
import { REIMBURSEMENT_TYPES } from "@/lib/types";

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
    .select("id, user_id, amount, expense_type, expense_date, description, evidence_url, month, approver_id")
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

    // An approved claim becomes money finance has to pay out: tell finance by
    // email and raise a Pending Payout for every admin.
    if (approved) {
      const { data: claimant } = await svc
        .from("profiles").select("full_name, email, employee_id").eq("id", claim.user_id).single();
      const who = claimant?.full_name || "A team member";
      const typeLabel = REIMBURSEMENT_TYPES.find(t => t.value === claim.expense_type)?.label || claim.expense_type;
      const fullDate = new Date(claim.expense_date + "T00:00:00")
        .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

      // Pending Payout for admins
      const { data: admins } = await svc.from("profiles").select("id").eq("role", "admin");
      const adminRows = (admins || []).map(a => ({
        user_id: a.id,
        type: "info",
        title: "Pending payout",
        body: `${who} — ${amount} ${typeLabel} reimbursement approved by ${actorName}`,
        link: "/dashboard/salary",
        read: false,
      }));
      if (adminRows.length) {
        await svc.from("notifications").insert(adminRows);
      }

      // Automated notice to finance
      const rows: [string, string][] = [
        ["Team member", who + (claimant?.employee_id ? ` (${claimant.employee_id})` : "")],
        ["Amount", amount],
        ["Category", typeLabel],
        ["Date of expense", fullDate],
        ["Payout month", claim.month],
        ["Approved by", actorName],
      ];
      if (claim.description) rows.push(["Description", String(claim.description)]);

      const table = rows.map(([k, v]) =>
        `<tr><td style="padding:5px 14px 5px 0;color:#64748b;white-space:nowrap;">${k}</td>` +
        `<td style="padding:5px 0;color:#0f172a;font-weight:600;">${v}</td></tr>`).join("");

      const evidence = claim.evidence_url
        ? `<p style="margin:14px 0 0;"><a href="${claim.evidence_url}" style="color:#7c3aed;">View supporting evidence</a></p>`
        : `<p style="margin:14px 0 0;color:#b45309;">No supporting evidence was attached to this claim.</p>`;

      const html = emailShell(
        "Reimbursement approved — payout due",
        `<p style="margin:0 0 12px;">An expense reimbursement has been approved and is now due for payout.</p>
         <table role="presentation" style="border-collapse:collapse;font-size:14px;">${table}</table>
         ${evidence}
         <p style="margin:16px 0 0;color:#64748b;font-size:13px;">It appears as a separate line item against ${who} in Salary &amp; Payouts for ${claim.month}.</p>`,
        "/dashboard/salary",
        "Open Salary & Payouts",
      );

      const text = `Reimbursement approved — payout due\n\n`
        + rows.map(([k, v]) => `${k}: ${v}`).join("\n")
        + (claim.evidence_url ? `\nEvidence: ${claim.evidence_url}` : "\nEvidence: none attached")
        + `\n\nShows against ${who} in Salary & Payouts for ${claim.month}.`;

      // Never fail the approval because email failed — report it instead
      const mail = await sendEmail({
        to: FINANCE_EMAIL,
        subject: `Reimbursement approved — ${amount} for ${who}`,
        html, text,
        relatedType: "reimbursement",
        relatedId: claim.id,
      });

      const { error: notifyErr } = await svc.from("notifications").insert({
        user_id: recipientId, type: "info", title, body,
        link: "/dashboard/profile", read: false,
      });
      if (notifyErr) return NextResponse.json({ error: notifyErr.message }, { status: 500 });

      return NextResponse.json({
        ok: true,
        notified: 1 + adminRows.length,
        finance_email: mail.ok ? "sent" : mail.skipped ? "not_configured" : "failed",
        finance_email_error: mail.ok ? undefined : mail.error,
      });
    }
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
