import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { SocialPlatformData } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fmtNum(n?: number) { if (!n && n !== 0) return "N/A"; if (n >= 1e6) return `${(n/1e6).toFixed(1)}M`; if (n >= 1e3) return `${(n/1e3).toFixed(1)}K`; return n.toString(); }

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { client_id, client_name, period_from, period_to, platforms } = body as {
      client_id?: string; client_name: string; period_from: string; period_to: string;
      platforms: SocialPlatformData[];
    };

    if (!client_name || !period_from || !period_to || !platforms?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Build metrics summary for AI
    const metricsSummary = platforms.map(p => {
      const lines: string[] = [`Platform: ${p.platform}`];
      if (p.followers) lines.push(`  Followers: ${fmtNum(p.followers)}`);
      if (p.new_followers) lines.push(`  New followers gained: ${fmtNum(p.new_followers)}`);
      if (p.posts) lines.push(`  Posts published: ${p.posts}`);
      if (p.reach) lines.push(`  Total reach: ${fmtNum(p.reach)}`);
      if (p.impressions) lines.push(`  Impressions: ${fmtNum(p.impressions)}`);
      if (p.engagements) lines.push(`  Total engagements: ${fmtNum(p.engagements)}`);
      if (p.engagement_rate) lines.push(`  Engagement rate: ${p.engagement_rate}%`);
      if (p.video_views) lines.push(`  Video views: ${fmtNum(p.video_views)}`);
      if (p.top_post_reach) lines.push(`  Top post reach: ${fmtNum(p.top_post_reach)}`);
      return lines.join("\n");
    }).join("\n\n");

    const fromLabel = new Date(period_from).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    const toLabel = new Date(period_to).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

    const prompt = `You are a senior social media analyst writing a professional client report for ${client_name}.

REPORT PERIOD: ${fromLabel} to ${toLabel}

METRICS DATA:
${metricsSummary}

Write a comprehensive social media performance report with:
1. **Executive Summary** — 2-3 sentences summarising overall performance
2. **Platform-by-Platform Analysis** — For each platform, analyse what the numbers mean, highlight wins, and note areas of concern
3. **Key Takeaways** — 3-5 bullet points with the most important insights
4. **Recommendations** — 3-4 actionable recommendations for the next period based on the data

Guidelines:
- Be professional, specific, and data-driven
- Reference actual numbers from the data
- Avoid generic statements — every insight should be tied to a specific metric
- Write in a client-facing tone — clear, positive but honest
- Use proper markdown formatting with ## headings and **bold** for key metrics
- Keep the total length to 400-600 words`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });

    const analysis = (message.content[0] as { type: string; text: string }).text;

    // Save to DB
    const { data: report, error } = await supabase
      .from("social_media_reports")
      .insert({
        client_id: client_id || null,
        client_name,
        period_from,
        period_to,
        platforms,
        screenshots: [],
        analysis,
        report_data: { generated_at: new Date().toISOString() },
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
