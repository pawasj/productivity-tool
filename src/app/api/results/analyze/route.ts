import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface LinkInput {
  handle_name: string;
  platform: string;
  live_link: string;
  deliverable_type?: string;
}

interface LinkMetrics {
  handle_name: string;
  platform: string;
  live_link: string;
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  engagement?: number;
  extra_note?: string;
  fetch_status: "ok" | "partial" | "unavailable";
  fetched_at: string;
}

export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: LinkInput[] } = await req.json();
    if (!rows?.length) return NextResponse.json({ error: "No rows" }, { status: 400 });

    const results: LinkMetrics[] = [];

    for (const row of rows) {
      if (!row.live_link?.startsWith("http")) {
        results.push({ ...row, fetch_status: "unavailable", fetched_at: new Date().toISOString(), extra_note: "No valid URL provided" });
        continue;
      }

      try {
        const prompt = `You are a social media analytics researcher. Fetch REAL, LIVE metrics from this ${row.platform} post by visiting the URL below. Do NOT guess or hallucinate — only report numbers that are publicly visible on the page.

URL: ${row.live_link}
Creator/Page: ${row.handle_name}
Platform: ${row.platform}
${row.deliverable_type ? `Content Type: ${row.deliverable_type}` : ""}

Instructions:
1. Visit the URL using web search/browse
2. Report ONLY publicly visible metrics (views, likes, comments, shares, reach if shown)
3. For YouTube: views are public. For Instagram: likes may be hidden. For Reddit: upvotes and comments are public. For LinkedIn: reactions and comments are public.
4. If a metric is not publicly available, return null for that field — do not estimate
5. Return a JSON object with this EXACT structure (use null for unavailable):
{
  "views": <number or null>,
  "likes": <number or null>,
  "comments": <number or null>,
  "shares": <number or null>,
  "reach": <number or null>,
  "engagement": <number or null - total engagements if calculable>,
  "fetch_status": "ok" | "partial" | "unavailable",
  "extra_note": "<any important note about data availability>"
}

Return ONLY the JSON, nothing else.`;

        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          tools: [{ type: "web_search_20250305" as "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: prompt }],
        });

        // Extract the text response from the final message
        let jsonStr = "";
        for (const block of response.content) {
          if (block.type === "text") {
            jsonStr = block.text;
            break;
          }
        }

        // Parse the JSON
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          results.push({
            handle_name: row.handle_name,
            platform: row.platform,
            live_link: row.live_link,
            views: parsed.views ?? undefined,
            likes: parsed.likes ?? undefined,
            comments: parsed.comments ?? undefined,
            shares: parsed.shares ?? undefined,
            reach: parsed.reach ?? undefined,
            engagement: parsed.engagement != null ? parsed.engagement : (((parsed.likes || 0) + (parsed.comments || 0) + (parsed.shares || 0)) || undefined),
            extra_note: parsed.extra_note,
            fetch_status: parsed.fetch_status || "partial",
            fetched_at: new Date().toISOString(),
          });
        } else {
          results.push({ ...row, fetch_status: "unavailable", fetched_at: new Date().toISOString(), extra_note: "Could not parse metrics from page" });
        }
      } catch {
        results.push({ ...row, fetch_status: "unavailable", fetched_at: new Date().toISOString(), extra_note: "Fetch failed" });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
