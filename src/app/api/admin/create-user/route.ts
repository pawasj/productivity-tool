import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name, role, department, designation, reporting_manager_id, access_levels } = await req.json();

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: "email, password, and full_name are required" }, { status: 400 });
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY not configured. Add it to your environment variables." },
        { status: 500 }
      );
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name, role: role || "member" },
      email_confirm: true, // auto-confirm, no email link needed
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Upsert profile
    await adminClient.from("profiles").upsert({
      id: data.user.id, email, full_name, role: role || "member",
      department: department || null,
      designation: designation || null,
      locked_designation: designation || null,
      locked_department: department || null,
      locked_reporting_manager_id: reporting_manager_id || null,
      reporting_manager_id: reporting_manager_id || null,
      access_levels: access_levels || [],
    });

    return NextResponse.json({ success: true, user: { id: data.user.id, email, full_name, role } });
  } catch (err: unknown) {
    console.error("create-user error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
