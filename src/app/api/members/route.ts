import { createServiceRoleClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export async function GET() {
  const svc = createServiceRoleClient();
  const { data, error } = await svc
    .from("profiles")
    .select("id, full_name, email, designation, role")
    .order("full_name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}
