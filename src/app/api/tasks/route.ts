import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const [{ data, error }, { data: members }] = await Promise.all([
    service
      .from("todos")
      .select("*, vertical:verticals(id,name,color,icon), creator:profiles!todos_user_id_fkey(id,full_name,designation)")
      .order("created_at", { ascending: false }),
    service
      .from("profiles")
      .select("id, full_name, email, designation, role")
      .order("full_name"),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, members: members || [] });
}
