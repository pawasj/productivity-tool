import { createServiceRoleClient } from "@/lib/supabase-server";

/**
 * Outbound email for automated system notices.
 *
 * Uses Resend's HTTP API over fetch — no SDK, so nothing to install. Every
 * attempt is written to `outbound_emails` first, so a missing API key or a
 * provider outage leaves a durable record that can be retried, rather than
 * silently dropping the notice.
 *
 * Required env: RESEND_API_KEY, MAIL_FROM (a verified sender on the domain).
 */

export const FINANCE_EMAIL = process.env.FINANCE_EMAIL || "finance@bccmedianetwork.com";
const FROM = process.env.MAIL_FROM || "BCC Media Network <noreply@bccmedianetwork.com>";

export interface SendEmailArgs {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Ties the log row back to what triggered it, e.g. "reimbursement" */
  relatedType?: string;
  relatedId?: string;
}

export interface SendEmailResult {
  ok: boolean;
  skipped?: boolean;
  id?: string;
  error?: string;
  logId?: string;
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const recipients = Array.isArray(args.to) ? args.to : [args.to];
  const svc = createServiceRoleClient();

  // Log first so the intent survives whatever happens next
  let logId: string | undefined;
  try {
    const { data } = await svc.from("outbound_emails").insert({
      to_addresses: recipients,
      subject: args.subject,
      body_html: args.html,
      body_text: args.text || null,
      related_type: args.relatedType || null,
      related_id: args.relatedId || null,
      status: "pending",
    }).select("id").single();
    logId = data?.id;
  } catch {
    // An unmigrated log table must never block the send
  }

  async function finish(patch: Record<string, unknown>) {
    if (!logId) return;
    try {
      await svc.from("outbound_emails").update(patch).eq("id", logId);
    } catch { /* logging is best-effort */ }
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await finish({ status: "skipped", provider_response: "RESEND_API_KEY not configured" });
    return { ok: false, skipped: true, error: "RESEND_API_KEY not configured", logId };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: recipients,
        subject: args.subject,
        html: args.html,
        ...(args.text ? { text: args.text } : {}),
      }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = json?.message || `Provider returned ${res.status}`;
      await finish({ status: "failed", provider_response: JSON.stringify(json).slice(0, 2000) });
      return { ok: false, error, logId };
    }

    await finish({ status: "sent", sent_at: new Date().toISOString(), provider_id: json?.id || null });
    return { ok: true, id: json?.id, logId };
  } catch (e) {
    const error = (e as Error).message;
    await finish({ status: "failed", provider_response: error.slice(0, 2000) });
    return { ok: false, error, logId };
  }
}

/** Shared shell so every system email looks the same in an inbox. */
export function emailShell(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://bombaycontentcompany.com";
  const href = ctaUrl?.startsWith("http") ? ctaUrl : `${base}${ctaUrl || ""}`;
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;border-collapse:separate;">
    <tr><td style="padding:24px 28px 8px;">
      <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#7c3aed;">BCC Media Network</p>
      <h1 style="margin:8px 0 0;font-size:19px;line-height:1.3;color:#0f172a;">${title}</h1>
    </td></tr>
    <tr><td style="padding:12px 28px 4px;font-size:14px;line-height:1.6;color:#334155;">${bodyHtml}</td></tr>
    ${ctaUrl ? `<tr><td style="padding:18px 28px 26px;">
      <a href="${href}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;">${ctaLabel || "Open in the tool"}</a>
    </td></tr>` : `<tr><td style="padding:0 28px 26px;"></td></tr>`}
    <tr><td style="padding:14px 28px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;">
      Automated message from the BCC Media Network tool. Please do not reply.
    </td></tr>
  </table>
</body></html>`;
}
