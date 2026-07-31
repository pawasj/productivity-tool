import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { task_title, assignee_ids, assigner_id } = await req.json() as {
      task_title: string; assignee_ids: string[]; assigner_id: string;
    };

    const { data: assigner } = await supabase.from("profiles").select("full_name").eq("id", assigner_id).single();
    const assignerName = (assigner as { full_name: string } | null)?.full_name || "Someone";

    // Insert one notification per assignee into the notifications table
    const notifications = assignee_ids
      .filter(id => id !== assigner_id)
      .map(user_id => ({
        user_id,
        type: "task_assigned",
        title: "New task assigned",
        body: `${assignerName} assigned you a task: "${task_title}"`,
        link: "/dashboard/tasks",
        read: false,
        created_at: new Date().toISOString(),
      }));

    if (notifications.length) {
      const svc = createServiceRoleClient();
      const { error } = await svc.from("notifications").insert(notifications);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("task notify error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
