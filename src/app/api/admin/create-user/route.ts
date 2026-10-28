import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

const ROLES = ["admin", "member", "hrms"] as const;

// POST /api/admin/create-user
// Admins may create anyone with any role and access. HRMS users may only
// create plain members with no access — an admin assigns access afterwards.
export async function POST(req: NextRequest) {
  try {
    // This route mints accounts, so it must know who is calling
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const svc = createServiceRoleClient();
    const { data: caller } = await svc.from("profiles").select("role").eq("id", user.id).single();
    const isAdmin = caller?.role === "admin";
    const isHrms = caller?.role === "hrms";
    if (!isAdmin && !isHrms) {
      return NextResponse.json({ error: "Only admins and HRMS can add team members" }, { status: 403 });
    }

    const body = await req.json();
    const { email, password, full_name, department, designation, employment_type, reporting_manager_id } = body;

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: "email, password, and full_name are required" }, { status: 400 });
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // HRMS cannot grant anything — role and access are forced, whatever was sent
    const role = isAdmin && ROLES.includes(body.role) ? body.role : "member";
    const access_levels = isAdmin && Array.isArray(body.access_levels) ? body.access_levels : [];

    const { data, error } = await svc.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name, role },
      email_confirm: true, // auto-confirm, no email link needed
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { error: profileErr } = await svc.from("profiles").upsert({
      id: data.user.id, email, full_name, role,
      department: department || null,
      designation: designation || null,
      employment_type: employment_type || "full_time",
      locked_designation: designation || null,
      locked_department: department || null,
      locked_reporting_manager_id: reporting_manager_id || null,
      reporting_manager_id: reporting_manager_id || null,
      access_levels,
    });
    if (profileErr) {
      // Don't leave a login with no profile behind
      await svc.auth.admin.deleteUser(data.user.id).catch(() => {});
      return NextResponse.json({ error: `Couldn't create profile: ${profileErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: { id: data.user.id, email, full_name, role } });
  } catch (err: unknown) {
    console.error("create-user error:", err);
    return NextResponse.json({ error: "Couldn't create the user" }, { status: 500 });
  }
}
