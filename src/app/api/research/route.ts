import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_PROMPTS: Record<string, string> = {
  competitor_analysis: `COMPETITOR ANALYSIS — Search the web to find:
1. Direct competitors of this brand (at least 5 real competitors with verified data)
2. Each competitor's: market position, estimated revenue/funding, key products/services, social media presence, recent campaigns
3. Competitive advantages and weaknesses of each
4. Market share estimates if available
5. Recent news about competitors
Be thorough and only include verified, real companies. Do multiple searches.`,

  sentiment_analysis: `SENTIMENT ANALYSIS — Search the web, Reddit, news, and review sites to find:
1. Overall public perception of this brand (positive/negative/neutral with estimated percentages)
2. Most praised aspects (with real examples/quotes from reviews)
3. Most criticized aspects (with real examples/complaints)
4. Recent sentiment shifts (any PR events, controversies, viral moments)
5. Platform-specific sentiment (LinkedIn vs Reddit vs news coverage)
6. Customer review highlights from Google, Trustpilot, App Store, etc.
Be thorough. Do multiple searches across different platforms.`,

  social_media_listening: `SOCIAL MEDIA LISTENING — Search the web to find:
1. Brand's presence and following on each major platform (Instagram, LinkedIn, YouTube, Twitter/X, Facebook)
2. Trending hashtags and topics associated with this brand
3. Recent viral posts or campaigns by this brand
4. Type of content that performs best for this brand
5. Community discussions about this brand (Reddit threads, LinkedIn posts, comments)
6. Brand's posting frequency and engagement patterns
7. Key brand moments and milestones on social media
Do multiple searches. Only report verified, real data.`,

  campaign_ideas: `CAMPAIGN IDEAS — First search the web to understand:
1. The brand's current marketing style, tone, and voice from their social media/website
2. What campaigns have worked in their category recently
3. Cultural moments, trends, and hashtags relevant to their audience
4. Competitor campaign strategies

Then generate exactly 9 campaign ideas with:
- Catchy campaign title/name
- Core concept (2-3 sentences)
- Content format (Reel/Video/Post/Series/Collab/Live)
- Primary platform
- Tagline or hook
- Viral potential (why it would spread)
Include: 3 video ideas (Reels/YouTube), 2 content IP/series ideas, 2 brand collab/partnership ideas, 2 trend-jacking or cultural moment ideas.
Make them crisp, creative, and actionable — nothing generic.`,
};

async function runAnalysis(brandName: string, links: string[], types: string[]): Promise<Record<string, unknown>> {
  const linksContext = links.length > 0 ? `\n\nReference links for this brand:\n${links.join("\n")}` : "";

  const results: Record<string, unknown> = {};

  // Run each analysis type with its own focused Claude call + web search
  await Promise.all(types.map(async (type) => {
    const prompt = ANALYSIS_PROMPTS[type];
    if (!prompt) return;

    const userPrompt = `Brand/Client: "${brandName}"${linksContext}

${prompt}

After thorough web research, return ONLY a valid JSON object (no markdown, no explanation outside JSON) with this structure for "${type}":

${type === "competitor_analysis" ? `{
  "summary": "2-3 sentence executive summary",
  "competitors": [
    {
      "name": "Company Name",
      "tagline": "their tagline",
      "market_position": "Leader/Challenger/Niche",
      "strengths": ["strength1", "strength2"],
      "weaknesses": ["weakness1"],
      "social_presence": "description",
      "recent_news": "latest development"
    }
  ],
  "market_insights": ["insight1", "insight2", "insight3"],
  "opportunities": ["opportunity1", "opportunity2"],
  "threats": ["threat1", "threat2"],
  "competitive_landscape": "overall landscape description"
}` : type === "sentiment_analysis" ? `{
  "summary": "2-3 sentence summary",
  "overall_score": 72,
  "positive_pct": 65,
  "neutral_pct": 20,
  "negative_pct": 15,
  "praised": [{"aspect": "aspect name", "detail": "specific example/quote"}],
  "criticized": [{"aspect": "aspect name", "detail": "specific example/complaint"}],
  "platform_sentiment": [
    {"platform": "LinkedIn", "score": 80, "summary": "professional perception"},
    {"platform": "Reddit", "score": 55, "summary": "community discussion tone"},
    {"platform": "News", "score": 70, "summary": "press coverage tone"},
    {"platform": "Reviews", "score": 65, "summary": "customer review sentiment"}
  ],
  "recent_events": ["event1", "event2"],
  "notable_quotes": ["real quote or paraphrase from public sources"],
  "recommendations": ["recommendation1", "recommendation2"]
}` : type === "social_media_listening" ? `{
  "summary": "2-3 sentence summary",
  "platforms": [
    {"name": "Instagram", "handle": "@handle", "followers": "50K", "engagement": "3.2%", "content_type": "Reels, product shots", "posting_freq": "5x/week"},
    {"name": "LinkedIn", "handle": "Company Page", "followers": "12K", "engagement": "2.1%", "content_type": "thought leadership", "posting_freq": "3x/week"}
  ],
  "trending_hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "top_content_themes": ["theme1", "theme2", "theme3"],
  "viral_moments": [{"description": "what happened", "platform": "Instagram", "approx_reach": "500K"}],
  "audience_insights": "description of their audience",
  "content_gaps": ["gap1", "gap2"],
  "recommendations": ["recommendation1", "recommendation2"]
}` : `{
  "summary": "2-3 sentence brand overview and campaign context",
  "brand_tonality": "description of voice, tone, style",
  "ideas": [
    {
      "title": "Campaign Name",
      "concept": "2-3 sentence description of the campaign idea",
      "format": "Reel Series",
      "platform": "Instagram + YouTube",
      "tagline": "Catchy tagline or hook",
      "viral_hook": "Why this would spread / what makes it shareable",
      "category": "Video Idea"
    }
  ],
  "content_calendar_suggestion": "Suggested rollout approach"
}`}`;

    try {
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

      // Use web search for research types, direct for campaign ideas too but still search for brand context
      let response = await (anthropic.beta.messages.create as Function)({
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages,
        betas: ["web-search-2025-03-05"],
      });

      // Handle tool use loop
      while (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter((b: Anthropic.ContentBlock) => b.type === "tool_use");
        const toolResults: Anthropic.ToolResultBlockParam[] = toolUseBlocks.map((b: Anthropic.ToolUseBlock) => ({
          type: "tool_result" as const,
          tool_use_id: b.id,
          content: JSON.stringify((b as unknown as { input: unknown }).input),
        }));

        messages.push({ role: "assistant", content: response.content });
        messages.push({ role: "user", content: toolResults });

        response = await (anthropic.beta.messages.create as Function)({
          model: "claude-sonnet-4-6",
          max_tokens: 6000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages,
          betas: ["web-search-2025-03-05"],
        });
      }

      // Extract JSON from the final text response
      const text = response.content.filter((b: Anthropic.ContentBlock) => b.type === "text")
        .map((b: Anthropic.TextBlock) => b.text).join("");

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        results[type] = JSON.parse(jsonMatch[0]);
      } else {
        results[type] = { summary: text, raw: true };
      }
    } catch (err) {
      console.error(`Research error for ${type}:`, err);
      results[type] = { error: "Analysis could not be completed", details: String(err) };
    }
  }));

  return results;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const service = createServiceRoleClient();
  const { data } = await service
    .from("research_reports")
    .select("id, brand_name, analysis_types, status, created_at, created_by, creator:profiles!research_reports_created_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ data: data || [] });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const service = createServiceRoleClient();
  await service.from("research_reports").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brand_name, links = [], analysis_types } = await req.json() as {
    brand_name: string; links: string[]; analysis_types: string[];
  };

  if (!brand_name || !analysis_types?.length) {
    return NextResponse.json({ error: "brand_name and analysis_types required" }, { status: 400 });
  }

  const service = createServiceRoleClient();

  // Create initial record
  const { data: report } = await service.from("research_reports").insert({
    brand_name, links, analysis_types, status: "running", created_by: user.id,
    created_at: new Date().toISOString(),
  }).select().single();

  if (!report) return NextResponse.json({ error: "DB error" }, { status: 500 });

  try {
    const results = await runAnalysis(brand_name, links, analysis_types);

    await service.from("research_reports").update({
      status: "done", result: results, completed_at: new Date().toISOString(),
    }).eq("id", report.id);

    return NextResponse.json({ id: report.id, status: "done", result: results });
  } catch (err) {
    await service.from("research_reports").update({ status: "error" }).eq("id", report.id);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
