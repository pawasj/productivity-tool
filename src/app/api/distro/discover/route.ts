import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface DiscoveryResult {
  handle_name: string;
  platform: string;
  category: string;
  followers: string;
  engagement_rate?: string;
  location?: string;
  contact?: string;
  rationale: string;
  match_score: "High" | "Medium" | "Low";
  profile_url?: string;
  type: "creator" | "page";
}

export async function POST(req: NextRequest) {
  try {
    const { brief } = await req.json();
    if (!brief?.brand_name) return NextResponse.json({ error: "brand_name required" }, { status: 400 });

    const contentType = brief.content_type || "both";
    const geography = brief.target_geography || "India";

    const searchFocus = contentType === "creators"
      ? "individual content creators and influencers"
      : contentType === "pages"
      ? "community pages, meme pages, and mass-reach social media pages"
      : "content creators, influencers, and community/meme pages";

    const prompt = `You are a senior influencer marketing strategist at BCC Media Network, an Indian social media agency.

CAMPAIGN BRIEF:
Brand: ${brief.brand_name}
Industry: ${brief.industry || "Not specified"}
Campaign Type: ${brief.campaign_type || "Brand Awareness"}
Objective: ${brief.campaign_objective || "Not specified"}
Target Audience: ${brief.target_audience || "Not specified"}
Geography: ${geography}
Distribution Mix: ${contentType === "creators" ? "Creators & Influencers only" : contentType === "pages" ? "Community Pages only" : "Creators + Community Pages"}
Budget: ₹${parseFloat(brief.total_budget || "0").toLocaleString() || "Not specified"}

TASK:
Research and identify the best ${searchFocus} for this campaign. Use the web_search tool to:
1. Search for top Indian ${contentType === "pages" ? "meme pages, community pages" : contentType === "creators" ? "influencers, content creators" : "influencers and community pages"} in the ${brief.industry || ""} space on Instagram, YouTube, LinkedIn
2. Verify their follower counts and engagement rates from recent data
3. Check if they are actively posting and relevant to ${geography}
4. Find contact information where available

After researching, provide 10–15 results as a JSON array. Only include handles/pages you have actually found evidence of — do NOT fabricate data.

Return ONLY a JSON object (no markdown fences):
{
  "results": [
    {
      "handle_name": "@actual_handle",
      "platform": "instagram",
      "category": "Meme Page",
      "followers": "2.3M",
      "engagement_rate": "4.2%",
      "location": "Mumbai, Maharashtra",
      "contact": "",
      "rationale": "Why this matches the brand — specific reason",
      "match_score": "High",
      "profile_url": "https://instagram.com/actual_handle",
      "type": "page"
    }
  ]
}

match_score must be "High", "Medium", or "Low" based on how well the creator/page matches this specific brief.
type must be "creator" for individual influencers or "page" for community/meme pages.`;

    // Use web_search tool to get real data
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    // Extract the final text response (after tool use)
    let finalText = "";
    for (const block of message.content) {
      if (block.type === "text") {
        finalText += block.text;
      }
    }

    // Parse JSON from response
    const jsonMatch = finalText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Fallback: no web search available, use AI knowledge
      return await fallbackDiscovery(brief, contentType, geography);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const results: DiscoveryResult[] = (parsed.results || []).filter(
      (r: DiscoveryResult) => r.handle_name && r.platform && r.rationale
    );

    return NextResponse.json({ results, source: "web_search" });
  } catch (err: unknown) {
    console.error("discover error:", err);
    // If web search not available or fails, fall back to AI knowledge
    try {
      const { brief } = await req.json().catch(() => ({}));
      return await fallbackDiscovery(brief || {}, "both", "India");
    } catch {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }
}

async function fallbackDiscovery(brief: Record<string, string>, contentType: string, geography: string) {
  const prompt = `You are a senior influencer marketing strategist with deep knowledge of the Indian social media landscape.

CAMPAIGN BRIEF:
Brand: ${brief.brand_name || "Unknown Brand"}
Industry: ${brief.industry || "Not specified"}
Target: ${brief.target_audience || "Not specified"}
Geography: ${geography}
Type: ${contentType}

Based on your knowledge of real Indian social media accounts (as of your training data), suggest 12–15 ${contentType === "pages" ? "community pages and meme pages" : contentType === "creators" ? "content creators and influencers" : "creators and community pages"} suitable for this campaign.

Only include real, well-known accounts that actually exist. State clearly in the rationale if follower data is approximate.

Return ONLY valid JSON (no markdown):
{
  "results": [
    {
      "handle_name": "@handle",
      "platform": "instagram",
      "category": "Meme Page",
      "followers": "~2.5M (approx)",
      "engagement_rate": "~3–5%",
      "location": "India",
      "contact": "",
      "rationale": "Reason this matches the brief",
      "match_score": "High",
      "profile_url": "https://instagram.com/handle",
      "type": "page"
    }
  ]
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (message.content[0] as { type: string; text: string }).text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return NextResponse.json({ results: [], source: "fallback" });

  const parsed = JSON.parse(jsonMatch[0]);
  return NextResponse.json({ results: parsed.results || [], source: "ai_knowledge", disclaimer: "Results based on AI training data — verify before use." });
}
