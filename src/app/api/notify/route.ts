import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// POST — create in-app notifications for one or more users (mentions, POC
// assignments, etc.). Sender must be authenticated; recipients exclude sender.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { user_ids, type, title, message } = await req.json() as {
    user_ids: string[]; type: string; title: string; message: string;
  };
  if (!user_ids?.length || !title) return NextResponse.json({ error: "user_ids and title required" }, { status: 400 });

  const svc = createServiceRoleClient();
  const rows = Array.from(new Set(user_ids)).filter(id => id && id !== user.id).map(user_id => ({
    user_id,
    type: type || "mention",
    title,
    message: message || "",
    is_read: false,
    created_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return NextResponse.json({ created: 0 });

  const { error } = await svc.from("notifications").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ created: rows.length });
}
