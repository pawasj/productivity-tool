import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function parseFollowers(s: string): number {
  if (!s) return 0;
  const u = s.toString().trim().toUpperCase();
  if (u.endsWith("M")) return Math.round(parseFloat(u) * 1_000_000);
  if (u.endsWith("K")) return Math.round(parseFloat(u) * 1_000);
  return parseInt(u.replace(/[^0-9]/g, "")) || 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { influencer_type, person_name, contact_no, email, location, state, category, notes, platforms } = body;

    if (!influencer_type || !platforms?.length || !platforms[0]?.handle_name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const primary = platforms[0];
    const additional = platforms.slice(1);

    const supabase = getSupabase();
    const { error } = await supabase.from("influencer_submissions").insert({
      influencer_type,
      person_name: person_name || null,
      contact_no: contact_no || null,
      email: email || null,
      location: location || null,
      state: state || null,
      category: category || null,
      notes: notes || null,
      handle_name: primary.handle_name.trim(),
      channel_link: primary.channel_link || null,
      platform: primary.platform,
      followers: primary.followers ? parseFollowers(primary.followers) : null,
      rate_post: primary.rate_post ? parseFloat(primary.rate_post) : null,
      rate_reel: primary.rate_reel ? parseFloat(primary.rate_reel) : null,
      rate_story: primary.rate_story ? parseFloat(primary.rate_story) : null,
      rate_carousel: primary.rate_carousel ? parseFloat(primary.rate_carousel) : null,
      rate_collab_post: primary.rate_collab_post ? parseFloat(primary.rate_collab_post) : null,
      rate_combo: primary.rate_combo ? parseFloat(primary.rate_combo) : null,
      additional_platforms: additional.map((p: Record<string, string>) => ({
        platform: p.platform,
        handle_name: p.handle_name,
        channel_link: p.channel_link || null,
        followers: p.followers ? parseFollowers(p.followers) : null,
        rate_post: p.rate_post ? parseFloat(p.rate_post) : null,
        rate_reel: p.rate_reel ? parseFloat(p.rate_reel) : null,
        rate_story: p.rate_story ? parseFloat(p.rate_story) : null,
        rate_carousel: p.rate_carousel ? parseFloat(p.rate_carousel) : null,
        rate_collab_post: p.rate_collab_post ? parseFloat(p.rate_collab_post) : null,
        rate_combo: p.rate_combo ? parseFloat(p.rate_combo) : null,
      })),
      status: "pending",
    });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    console.error("join submission error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
