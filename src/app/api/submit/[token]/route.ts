import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// GET — return campaign info for the public form
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data: brief, error } = await supabase
    .from("client_briefs")
    .select("id, brand_name, industry, campaign_type, submission_token")
    .eq("submission_token", token)
    .single();

  if (error || !brief) {
    return NextResponse.json({ error: "Campaign not found. Please check your link." }, { status: 404 });
  }

  return NextResponse.json({
    brief_id: brief.id,
    brand_name: brief.brand_name,
    industry: brief.industry,
    campaign_type: brief.campaign_type,
  });
}

// POST — receive creator submission, run Claude Vision, update campaign results
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json();
  const { handle_name, live_link, platform, format, screenshot_url } = body;

  if (!handle_name || !live_link || !screenshot_url) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Look up the brief
  const { data: brief, error: briefErr } = await supabase
    .from("client_briefs")
    .select("id, brand_name, media_plan_json")
    .eq("submission_token", token)
    .single();

  if (briefErr || !brief) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  // Run Claude Vision on the screenshot to extract metrics
  const metrics = await extractMetricsFromScreenshot(screenshot_url, platform, format);

  // Load or create the campaign_results record
  const { data: existing } = await supabase
    .from("campaign_results")
    .select("id, result_rows")
    .eq("brief_id", brief.id)
    .single();

  const now = new Date().toISOString();

  const newRow = {
    handle_name,
    live_link,
    platform,
    format,
    screenshot_url,
    submitted_at: now,
    fetch_status: metrics ? "ok" : "partial",
    fetched_at: now,
    ...metrics,
    // Preserve media plan fields if this handle exists in the plan
    ...(findPlanRow(brief.media_plan_json, handle_name) || {}),
    // Override with submission data (live_link, platform, format take priority)
    handle_name,
    live_link,
    platform,
    format,
    screenshot_url,
    submitted_at: now,
    fetched_at: now,
    fetch_status: metrics ? "ok" as const : "partial" as const,
    ...metrics,
  };

  let updatedRows: unknown[];
  if (existing) {
    const rows = (existing.result_rows || []) as Record<string, unknown>[];
    const idx = rows.findIndex((r) => normalise(String(r.handle_name)) === normalise(handle_name));
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...newRow };
    } else {
      rows.push(newRow);
    }
    updatedRows = rows;
  } else {
    // Seed from media plan if exists
    const planRows = ((brief.media_plan_json || []) as Record<string, unknown>[]).map((p) => ({
      ...p,
      ...(normalise(String(p.handle_name)) === normalise(handle_name) ? newRow : {}),
    }));
    // If not in plan, add directly
    if (!planRows.some(p => normalise(String(p.handle_name)) === normalise(handle_name))) {
      planRows.push(newRow);
    }
    updatedRows = planRows;
  }

  const payload = {
    brief_id: brief.id,
    brand_name: brief.brand_name,
    result_rows: updatedRows,
    updated_at: now,
  };

  if (existing) {
    await supabase.from("campaign_results").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("campaign_results").insert(payload);
  }

  return NextResponse.json({ success: true, metrics });
}

function normalise(s: string) {
  return s.replace(/^@/, "").toLowerCase().trim();
}

function findPlanRow(plan: unknown, handleName: string): Record<string, unknown> | null {
  if (!Array.isArray(plan)) return null;
  return (plan as Record<string, unknown>[]).find(
    p => normalise(String(p.handle_name)) === normalise(handleName)
  ) || null;
}

async function extractMetricsFromScreenshot(
  imageUrl: string,
  platform: string,
  format: string
): Promise<Record<string, unknown> | null> {
  try {
    // Download the image and convert to base64
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) return null;
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = imgRes.headers.get("content-type") || "image/png";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: contentType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: base64 },
          },
          {
            type: "text",
            text: `This is an analytics screenshot from ${platform} for a ${format}. Extract ALL visible metrics.

Look for: views, plays, reach, impressions, likes, comments, shares, saves, watch time, accounts reached, profile visits.

Numbers may be formatted as "1.2K", "45K", "1.2M" — convert to full integers (1200, 45000, 1200000).

Respond ONLY with this JSON (use null for metrics not visible):
{"views": null, "reach": null, "likes": null, "comments": null, "shares": null, "saves": null, "engagement": null, "extra_note": "brief description of what you found"}`,
          },
        ],
      }],
    });

    const text = response.content.find(b => b.type === "text")?.text || "";
    const match = text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    return {
      views: parsed.views ?? undefined,
      reach: parsed.reach ?? undefined,
      likes: parsed.likes ?? undefined,
      comments: parsed.comments ?? undefined,
      shares: parsed.shares ?? undefined,
      engagement: parsed.engagement ??
        (((parsed.likes || 0) + (parsed.comments || 0) + (parsed.shares || 0)) || undefined),
      extra_note: parsed.extra_note,
    };
  } catch {
    return null;
  }
}
