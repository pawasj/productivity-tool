import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import type { OwnedMediaProperty } from "@/lib/types";

async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// Sync one property to the Distro Hub influencers DB (one row per platform link)
async function syncToDistro(prop: OwnedMediaProperty) {
  const svc = createServiceRoleClient();
  const pricing = prop.pricing || {};
  const platforms: Array<{ key: keyof OwnedMediaProperty["links"]; platform: string }> = [
    { key: "instagram", platform: "instagram" },
    { key: "linkedin", platform: "linkedin" },
    { key: "youtube", platform: "youtube" },
    { key: "reddit", platform: "reddit" },
    { key: "substack", platform: "substack" },
    { key: "website", platform: "website" },
  ];

  for (const { key, platform } of platforms) {
    const link = prop.links?.[key];
    if (!link) continue;

    const record = {
      handle_name: prop.name,
      channel_link: link,
      platform,
      category: prop.category || "Owned Media",
      followers: prop.metrics?.[key] || null,
      rate_post: pricing.post || null,
      rate_reel: pricing.reel || null,
      rate_story: pricing.story || null,
      rate_carousel: pricing.carousel || null,
      rate_collab_post: pricing.collab || null,
      notes: `Owned media property — synced from Owned Media panel`,
      is_owned: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await svc
      .from("influencers")
      .select("id")
      .eq("handle_name", prop.name)
      .eq("platform", platform)
      .maybeSingle();

    if (existing) await svc.from("influencers").update(record).eq("id", existing.id);
    else await svc.from("influencers").insert({ ...record, created_at: new Date().toISOString() });
  }
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceRoleClient();
  const { data, error } = await svc.from("owned_media_properties").select("*").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Partial<OwnedMediaProperty> & { id?: string };
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const svc = createServiceRoleClient();
  const payload = {
    name: body.name.trim(),
    category: body.category || null,
    links: body.links || {},
    metrics: body.metrics || {},
    cadence: body.cadence || {},
    pricing: body.pricing || {},
    notes: body.notes || null,
    updated_at: new Date().toISOString(),
  };

  let saved: OwnedMediaProperty;
  if (body.id) {
    const { data, error } = await svc.from("owned_media_properties").update(payload).eq("id", body.id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    saved = data as OwnedMediaProperty;
  } else {
    const { data, error } = await svc.from("owned_media_properties")
      .insert({ ...payload, created_by: user.id, created_at: new Date().toISOString() })
      .select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    saved = data as OwnedMediaProperty;
  }

  // Sync to Distro Hub (Community Pages) with the Owned Media tag
  try { await syncToDistro(saved); } catch (e) { console.error("distro sync failed:", e); }

  return NextResponse.json({ data: saved });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json() as { id: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const svc = createServiceRoleClient();
  const { error } = await svc.from("owned_media_properties").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
