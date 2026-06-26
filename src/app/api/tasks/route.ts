import { NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use service role to bypass RLS — fetch ALL todos across all users/verticals
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("todos")
    .select("*, vertical:verticals(id,name,color,icon), creator:profiles!todos_user_id_fkey(id,full_name,designation)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
