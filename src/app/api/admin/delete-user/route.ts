import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    // Caller must be an admin
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    if ((caller as { role?: string } | null)?.role !== "admin") {
      return NextResponse.json({ error: "Only admins can remove users" }, { status: 403 });
    }

    const { user_id } = await req.json() as { user_id: string };
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });
    if (user_id === user.id) return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });

    const svc = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Clean up every reference to this profile so the delete can't be blocked
    // by foreign keys. Personal data is deleted; shared records are detached.
    const cleanup: Array<() => PromiseLike<unknown>> = [
      // personal rows — delete
      () => svc.from("notifications").delete().eq("user_id", user_id),
      () => svc.from("todos").delete().eq("user_id", user_id),
      () => svc.from("reach_outs").delete().eq("user_id", user_id),
      () => svc.from("calendar_events").delete().eq("user_id", user_id),
      () => svc.from("employee_details").delete().eq("user_id", user_id),
      () => svc.from("employee_bank_details").delete().eq("user_id", user_id),
      () => svc.from("employee_documents").delete().eq("user_id", user_id),
      () => svc.from("leave_applications").delete().eq("user_id", user_id),
      () => svc.from("attendance_logs").delete().eq("user_id", user_id),
      () => svc.from("ideas").delete().eq("user_id", user_id),
      // shared records — detach (keep the data, drop the link)
      () => svc.from("leads").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("leads").update({ our_poc_id: null }).eq("our_poc_id", user_id),
      () => svc.from("client_briefs").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("expenses").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("salary_entries").update({ member_id: null }).eq("member_id", user_id),
      () => svc.from("salary_entries").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("research_reports").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("friends_of_bcc").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("owned_media_properties").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("owned_media_leads").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("company_holidays").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("vendors").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("social_media_reports").update({ created_by: null }).eq("created_by", user_id),
      () => svc.from("discussions").update({ with_member_id: null }).eq("with_member_id", user_id),
      () => svc.from("leave_applications").update({ approved_by: null }).eq("approved_by", user_id),
      () => svc.from("profiles").update({ reporting_manager_id: null }).eq("reporting_manager_id", user_id),
      () => svc.from("profiles").update({ locked_reporting_manager_id: null }).eq("locked_reporting_manager_id", user_id),
    ];
    // Best-effort: a missing table/column must not block the deletion
    for (const step of cleanup) {
      try { await step(); } catch { /* ignore */ }
    }

    // Delete the profile row, then the auth account
    const { error: profErr } = await svc.from("profiles").delete().eq("id", user_id);
    if (profErr) {
      return NextResponse.json({ error: `Profile delete failed: ${profErr.message}` }, { status: 500 });
    }

    const { error } = await svc.auth.admin.deleteUser(user_id);
    if (error && !/not found/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("delete-user error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
