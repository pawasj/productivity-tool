import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

// GET /api/admin/kyc-file?id=<kyc id>&doc=aadhaar|pan
// KYC files live in a private bucket. This hands an admin a short-lived signed
// URL for one document, so links never outlive the moment they are needed.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceRoleClient();
  const { data: me } = await svc.from("profiles").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  const doc = req.nextUrl.searchParams.get("doc");
  if (!id || (doc !== "aadhaar" && doc !== "pan")) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const { data: kyc } = await svc.from("influencer_kyc")
    .select("aadhaar_path, pan_path").eq("id", id).single();
  const path = doc === "aadhaar" ? kyc?.aadhaar_path : kyc?.pan_path;
  if (!path) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data, error } = await svc.storage.from("kyc-docs").createSignedUrl(path, 60);
  if (error || !data) return NextResponse.json({ error: error?.message || "Couldn't open file" }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl });
}
