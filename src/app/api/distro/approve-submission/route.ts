import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  try {
    // Verify the user is authenticated
    const authClient = await createServerSupabaseClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id, action } = await req.json(); // action: "approve" | "reject"
    if (!id || !["approve", "reject"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Fetch the submission
    const { data: sub, error: fetchErr } = await supabase
      .from("influencer_submissions")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !sub) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    if (action === "reject") {
      const { error } = await supabase
        .from("influencer_submissions")
        .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true, action: "rejected" });
    }

    // ── Approve: insert primary entry into influencers ──────────────────────
    const baseRecord = {
      handle_name: sub.handle_name,
      channel_link: sub.channel_link || null,
      category: sub.category || null,
      platform: sub.platform,
      followers: sub.followers || null,
      rate_post: sub.rate_post || null,
      rate_reel: sub.rate_reel || null,
      rate_story: sub.rate_story || null,
      rate_carousel: sub.rate_carousel || null,
      rate_collab_post: sub.rate_collab_post || null,
      rate_combo: sub.rate_combo || null,
      contact_no: sub.contact_no || null,
      person_name: sub.person_name || null,
      location: sub.location || null,
      state: sub.state || null,
      notes: sub.notes || null,
      influencer_type: sub.influencer_type,
      is_active: true,
    };

    // Upsert primary (by handle + platform)
    const { error: insertErr } = await supabase
      .from("influencers")
      .upsert(baseRecord, { onConflict: "handle_name,platform", ignoreDuplicates: false });
    if (insertErr) throw insertErr;

    // Insert additional platforms if any
    const additional = Array.isArray(sub.additional_platforms) ? sub.additional_platforms : [];
    for (const ap of additional) {
      if (!ap.handle_name || !ap.platform) continue;
      await supabase.from("influencers").upsert({
        handle_name: ap.handle_name,
        channel_link: ap.channel_link || null,
        category: sub.category || null,
        platform: ap.platform,
        followers: ap.followers || null,
        rate_post: ap.rate_post || null,
        rate_reel: ap.rate_reel || null,
        rate_story: ap.rate_story || null,
        rate_carousel: ap.rate_carousel || null,
        rate_collab_post: ap.rate_collab_post || null,
        rate_combo: ap.rate_combo || null,
        contact_no: sub.contact_no || null,
        person_name: sub.person_name || null,
        location: sub.location || null,
        state: sub.state || null,
        notes: sub.notes || null,
        influencer_type: sub.influencer_type,
        is_active: true,
      }, { onConflict: "handle_name,platform", ignoreDuplicates: false });
    }

    // Mark submission approved
    await supabase.from("influencer_submissions")
      .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);

    return NextResponse.json({ ok: true, action: "approved" });
  } catch (err: unknown) {
    console.error("approve-submission error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
