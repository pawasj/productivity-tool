import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { SocialPlatformData } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fmtNum(n?: number) {
  if (!n && n !== 0) return "N/A";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString("en-IN");
}

const PLATFORM_BENCHMARKS: Record<string, string> = {
  Instagram: `Instagram Industry Benchmarks:
- Avg engagement rate: 1.2–3% (brands), 3–6% (strong performers), <1% (underperforming)
- Avg follower growth/month: 0.5–2% (organic); >2% is strong
- Reach rate: 10–20% of follower base per post
- Stories completion rate benchmark: 70–85%
- Optimal posting frequency: 4–7 posts/week (feed + reels)
- Reels outperform static posts by 2–3x on reach`,

  LinkedIn: `LinkedIn Industry Benchmarks:
- Avg engagement rate: 2–5% is strong; <1% is low
- Avg follower growth/month: 1–3%
- Document/carousel posts get 2–3x more organic reach than text posts
- Company pages average 0.35% CTR
- Posts with images get 98% more comments
- Best performing content: thought leadership, case studies, employee stories`,

  YouTube: `YouTube Industry Benchmarks:
- Avg view duration (retention): 40–60% is good; >60% is excellent
- Avg click-through rate (CTR): 2–5% from impressions
- Subscriber conversion rate: 0.5–2% of views convert to subscribers
- Watch time is the primary ranking signal
- Avg like rate: 1–5% of views
- Community posts drive 1.5x more profile visits`,

  Facebook: `Facebook Industry Benchmarks:
- Avg organic reach: 4–8% of page followers per post
- Avg engagement rate: 0.06–0.3% (organic, all industries)
- Video content gets 59% more engagement than other post types
- Boosted posts avg CTR: 0.5–1.5%
- Optimal posting: 1–2 times/day`,

  "Twitter/X": `Twitter/X Industry Benchmarks:
- Avg engagement rate: 0.3–1% is typical; >1% is strong
- Avg follower growth/month: 1–5% (active accounts)
- Thread format drives 2x more impressions
- Media tweets get 35% more retweets`,

  TikTok: `TikTok Industry Benchmarks:
- Avg engagement rate: 5–9% is standard; >10% is excellent
- Avg video completion rate: 30–50%
- Follower growth: highly variable; viral potential is enormous
- Avg views-to-followers ratio: 100–500% of follower count
- For-You-Page reach can dwarf follower count`,

  Snapchat: `Snapchat Industry Benchmarks:
- Story open rate: 50–70% is healthy
- Avg swipe-up rate: 0.3–1%
- Primarily a younger audience (13–34)`,

  Pinterest: `Pinterest Industry Benchmarks:
- Avg engagement rate: 0.5–2%
- Pins have a long shelf-life (6+ months)
- Organic reach is driven by keyword SEO
- Avg click-through rate: 0.4–0.8%`,
};

function getBenchmarks(platformNames: string[]): string {
  const lines: string[] = [];
  for (const name of platformNames) {
    const key = Object.keys(PLATFORM_BENCHMARKS).find(k => name.toLowerCase().includes(k.toLowerCase()));
    if (key) lines.push(PLATFORM_BENCHMARKS[key]);
  }
  return lines.join("\n\n") || "Use general digital marketing benchmarks where platform-specific data is unavailable.";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json() as {
      client_id?: string;
      client_name: string;
      client_vertical?: string;
      period_from: string;
      period_to: string;
      created_by: string;
      platforms: Array<{
        name: string;
        screenshots: Array<{ base64: string; mediaType: string }>;
      }>;
    };

    const { client_id, client_name, client_vertical, period_from, period_to, platforms } = body;
    if (!client_name || !period_from || !period_to || !platforms?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const fromLabel = new Date(period_from).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const toLabel = new Date(period_to).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    // ── Step 1: Extract metrics from screenshots per platform ──────────────
    const extractedPlatforms: SocialPlatformData[] = [];

    for (const plat of platforms) {
      if (!plat.screenshots?.length) continue;

      const content: Anthropic.MessageParam["content"] = [
        {
          type: "text",
          text: `You are an expert social media analyst. The following ${plat.screenshots.length} screenshot(s) are all from the ${plat.name} analytics dashboard for the same account during the same period.

Extract ALL visible numeric metrics and return a single merged JSON object representing the combined/latest state for this platform. If the same metric appears in multiple screenshots, prefer the most recent or most complete value.

Return ONLY this JSON structure (fill in what you can see, use null for anything not visible):
{
  "platform": "${plat.name}",
  "followers": null,
  "new_followers": null,
  "posts": null,
  "reach": null,
  "impressions": null,
  "engagements": null,
  "engagement_rate": null,
  "video_views": null,
  "top_post_reach": null,
  "stories_views": null,
  "saves": null,
  "shares": null,
  "profile_visits": null,
  "link_clicks": null,
  "comments": null,
  "likes": null,
  "top_post_description": null,
  "raw_observations": "Any other noteworthy numbers or qualitative info visible in the screenshots"
}

Rules:
- Convert abbreviated numbers: 12.5K → 12500, 1.2M → 1200000
- engagement_rate must be a percentage number (e.g. 4.9 for 4.9%)
- Return only the JSON, no explanation`,
        },
      ];

      for (const s of plat.screenshots) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: s.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: s.base64,
          },
        });
      }

      const msg = await anthropic.messages.create({
        model: "claude-opus-4-8",
        max_tokens: 1000,
        messages: [{ role: "user", content }],
      });

      const raw = (msg.content[0] as { type: string; text: string }).text;
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          // Strip nulls
          const cleaned = Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== null && v !== undefined)) as SocialPlatformData;
          extractedPlatforms.push(cleaned);
        } catch { /* skip malformed */ }
      }
    }

    // ── Step 2: Generate deep analytical report ────────────────────────────
    const metricsSummary = extractedPlatforms.map(p => {
      const lines: string[] = [`\n### ${p.platform}`];
      if (p.followers !== undefined) lines.push(`- Followers: ${fmtNum(p.followers)}`);
      if (p.new_followers !== undefined) lines.push(`- New followers this period: +${fmtNum(p.new_followers)} (${p.followers ? ((p.new_followers / (p.followers - p.new_followers)) * 100).toFixed(2) : "?"}% growth)`);
      if (p.posts !== undefined) lines.push(`- Posts published: ${p.posts}`);
      if (p.reach !== undefined) lines.push(`- Total reach: ${fmtNum(p.reach)}${p.followers ? ` (${((p.reach / p.followers) * 100).toFixed(1)}% reach rate)` : ""}`);
      if (p.impressions !== undefined) lines.push(`- Impressions: ${fmtNum(p.impressions)}`);
      if (p.engagements !== undefined) lines.push(`- Total engagements: ${fmtNum(p.engagements)}`);
      if (p.engagement_rate !== undefined) lines.push(`- Engagement rate: ${p.engagement_rate}%`);
      if ((p as Record<string, unknown>).likes !== undefined) lines.push(`- Likes: ${fmtNum((p as Record<string, unknown>).likes as number)}`);
      if ((p as Record<string, unknown>).comments !== undefined) lines.push(`- Comments: ${fmtNum((p as Record<string, unknown>).comments as number)}`);
      if ((p as Record<string, unknown>).shares !== undefined) lines.push(`- Shares/Reposts: ${fmtNum((p as Record<string, unknown>).shares as number)}`);
      if ((p as Record<string, unknown>).saves !== undefined) lines.push(`- Saves: ${fmtNum((p as Record<string, unknown>).saves as number)}`);
      if (p.video_views !== undefined) lines.push(`- Video views: ${fmtNum(p.video_views)}`);
      if ((p as Record<string, unknown>).stories_views !== undefined) lines.push(`- Stories views: ${fmtNum((p as Record<string, unknown>).stories_views as number)}`);
      if ((p as Record<string, unknown>).profile_visits !== undefined) lines.push(`- Profile visits: ${fmtNum((p as Record<string, unknown>).profile_visits as number)}`);
      if ((p as Record<string, unknown>).link_clicks !== undefined) lines.push(`- Link clicks: ${fmtNum((p as Record<string, unknown>).link_clicks as number)}`);
      if (p.top_post_reach !== undefined) lines.push(`- Top post reach: ${fmtNum(p.top_post_reach)}`);
      if ((p as Record<string, unknown>).top_post_description) lines.push(`- Top performing content: ${(p as Record<string, unknown>).top_post_description}`);
      if ((p as Record<string, unknown>).raw_observations) lines.push(`- Additional observations: ${(p as Record<string, unknown>).raw_observations}`);
      return lines.join("\n");
    }).join("\n");

    const platformNames = extractedPlatforms.map(p => p.platform);
    const benchmarks = getBenchmarks(platformNames);
    const industryContext = client_vertical
      ? `The client operates in the **${client_vertical}** industry. Calibrate all competitive benchmarks and recommendations accordingly.`
      : "Apply general digital marketing benchmarks.";

    const analysisPrompt = `You are a senior social media strategist and data analyst writing a comprehensive performance report for the client **${client_name}**.

**Report Period:** ${fromLabel} to ${toLabel}
**Industry:** ${client_vertical || "General"}

---

## METRICS DATA EXTRACTED FROM SCREENSHOTS

${metricsSummary}

---

## PLATFORM BENCHMARKS (for comparison)

${benchmarks}

---

## INDUSTRY CONTEXT

${industryContext}

---

Write a detailed, professional social media performance report. Structure it as follows:

## Executive Summary
2–3 sentences covering the overall performance picture. Mention standout wins and the one biggest challenge. Be specific — cite actual numbers.

## Platform-by-Platform Deep Dive
For each platform that has data, write a dedicated section with:
- **Key metrics analysis**: What do the numbers tell us? Are they above or below benchmark?
- **Growth analysis**: Follower growth rate, trajectory assessment
- **Engagement quality**: Is the audience passive or active? Compare engagement rate to benchmark.
- **Content performance**: What formats or content types are working based on available data?
- **Reach & visibility**: How far is the content travelling relative to the follower base?
- **Red flags / concerns**: Any metrics that need urgent attention?

## Benchmark Comparison
A clear assessment of how this client stacks up against industry averages for each platform. Use language like "above average", "in line with", "below benchmark". Be honest.

## Competitive Context
Based on the ${client_vertical || "brand's"} industry, describe the typical competitive landscape on social media. What are competitors likely doing that this client should be aware of? What opportunities exist?

## Top Wins This Period
3–5 bullet points highlighting the strongest results with specific numbers.

## Concerns & Gaps
2–4 bullet points on underperforming metrics or missing data that needs attention.

## Strategic Recommendations
5–6 concrete, actionable recommendations for the next reporting period. Each recommendation must:
- Reference a specific metric or finding from the data
- Suggest a specific tactic or change
- Estimate the expected impact

## Focus Areas for Next Period
3 clear priorities ranked by expected ROI.

---

**Tone guidelines:**
- Professional, data-driven, client-facing — not academic
- Be honest about weaknesses while staying constructive
- Every insight must tie to a specific number from the data
- Use **bold** for key metrics and platform names
- Use proper markdown headings (##, ###) and bullet points
- Aim for 700–900 words total`;

    const analysisMsg = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 3000,
      messages: [{ role: "user", content: analysisPrompt }],
    });

    const analysis = (analysisMsg.content[0] as { type: string; text: string }).text;

    // ── Step 3: Save to DB ─────────────────────────────────────────────────
    const { data: report, error } = await supabase
      .from("social_media_reports")
      .insert({
        client_id: client_id || null,
        client_name,
        period_from,
        period_to,
        platforms: extractedPlatforms,
        screenshots: [],
        analysis,
        report_data: {
          generated_at: new Date().toISOString(),
          client_vertical: client_vertical || null,
          platform_count: extractedPlatforms.length,
        },
        created_by: user.id,
        created_at: new Date().toISOString(),
      })
      .select("share_token")
      .single();

    if (error) throw error;
    return NextResponse.json({ share_token: report.share_token });
  } catch (err) {
    console.error("social-media report error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Keep PUT for any legacy calls (now unused by the UI)
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { screenshots } = await req.json() as { screenshots: Array<{ base64: string; mediaType: string; platform: string }> };
    if (!screenshots?.length) return NextResponse.json({ platforms: [] });

    const content: Anthropic.MessageParam["content"] = [
      { type: "text", text: `Extract social media metrics from these screenshots. Return a JSON array with one object per screenshot: [{"platform":"Instagram","followers":null,...}]. Use null for missing values. Return only JSON.` },
    ];
    for (const s of screenshots) {
      content.push({ type: "image", source: { type: "base64", media_type: s.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: s.base64 } });
    }
    const message = await anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 2000, messages: [{ role: "user", content }] });
    const raw = (message.content[0] as { type: string; text: string }).text;
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const extracted: SocialPlatformData[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    return NextResponse.json({ platforms: extracted });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
