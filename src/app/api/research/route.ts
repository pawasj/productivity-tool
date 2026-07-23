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

  social_media_management: `SOCIAL MEDIA MANAGEMENT PLAN — First search the web to understand the brand's current social presence, voice, audience, category and what's working for peers. Then build a DEEP, month-specific social plan for {MONTH}.
Go platform-specific for Instagram and LinkedIn. Define:
- Content buckets (recurring content pillars) with cadence and sample ideas
- Instagram: strategy + specific Reel/Post/Carousel ideas (each with a scroll-stopping hook) + Story ideas + a recurring Reel/series concept
- LinkedIn: strategy + specific post/carousel ideas (each with a hook) + thought-leadership themes
- A week-by-week content calendar for the month (what goes on IG and LinkedIn each week)
- Relevant cultural moments, festivals, observances and trends happening in {MONTH} (India-first) the brand can ride
- A hashtag strategy
Be specific, creative and immediately usable — no filler.`,

  distribution_strategy: `DISTRIBUTION & AMPLIFICATION STRATEGY — First research the brand and its cultural space. Then design how to distribute and amplify it across owned + earned + seeded channels.
Define:
- Narrative buckets (the core angles/stories to tell) with why each works
- Multi-platform content arcs (episodic series that can run across platforms) with beat-by-beat episodes
- Amplification plays through: meme pages, pop-culture pages, news pages, LinkedIn creator profiles, Reddit communities (name specific subreddits + the approach), and any other channels
- A platform playbook (how to show up on each platform)
- Seeding tactics
Be specific with named page archetypes, real subreddits and concrete seeding tactics.`,

  production_ips: `PRODUCTION & IP IDEAS — First research the brand, its audience and the content whitespace in its category. Then generate original, ownable content IPs and ideas the brand can PRODUCE.
Provide:
- IP ideas: original shows / series / formats / podcasts — each with format, concept, a hook, target platforms, and monetization / franchise potential
- Standalone content ideas the brand can produce
- Campaign ideas tied to production
Think like a content studio — original, franchise-able, distinctive. No generic "post more reels" advice.`,
};

const MONTH_TOKEN = "{MONTH}";

const JSON_SCHEMAS: Record<string, string> = {
  social_media_management: `{
  "summary": "2-3 sentence overview of the social plan for the month",
  "month": "the month",
  "brand_voice": "the brand's voice/tone in one line",
  "content_buckets": [{"name": "bucket name", "description": "what it covers", "cadence": "e.g. 2x/week", "sample_ideas": ["idea1", "idea2"]}],
  "instagram": {
    "strategy": "IG-specific strategy for the month",
    "post_ideas": [{"format": "Reel/Carousel/Post", "concept": "the idea", "hook": "scroll-stopping hook", "bucket": "which bucket"}],
    "story_ideas": ["story idea1", "story idea2"],
    "series": [{"name": "series name", "concept": "recurring format concept"}]
  },
  "linkedin": {
    "strategy": "LinkedIn-specific strategy",
    "post_ideas": [{"format": "Text/Carousel/Document", "concept": "the idea", "hook": "the hook", "bucket": "which bucket"}],
    "themes": ["thought-leadership theme1", "theme2"]
  },
  "calendar": [{"week": "Week 1", "theme": "weekly theme", "instagram": ["what to post"], "linkedin": ["what to post"]}],
  "cultural_moments": ["festival/observance/trend in the month the brand can ride"],
  "hashtags": ["#hashtag1", "#hashtag2"],
  "recommendations": ["recommendation1", "recommendation2"]
}`,
  distribution_strategy: `{
  "summary": "2-3 sentence overview of the distribution strategy",
  "narrative_buckets": [{"name": "narrative angle", "angle": "the story to tell", "why_it_works": "why it lands"}],
  "content_arcs": [{"name": "arc name", "description": "the episodic concept", "platforms": ["Instagram", "YouTube"], "beats": ["episode/beat 1", "beat 2"]}],
  "amplification": {
    "meme_pages": ["specific approach via meme pages"],
    "pop_culture_pages": ["approach via pop-culture pages"],
    "news_pages": ["approach via news pages"],
    "linkedin_profiles": ["approach via LinkedIn creator profiles"],
    "reddit": ["r/subreddit — the approach"],
    "other": ["other amplification channel + approach"]
  },
  "platform_playbook": [{"platform": "Instagram", "approach": "how to show up", "formats": ["Reels", "Collabs"]}],
  "seeding_ideas": ["seeding tactic1", "seeding tactic2"],
  "recommendations": ["recommendation1", "recommendation2"]
}`,
  production_ips: `{
  "summary": "2-3 sentence overview of the IP/production opportunity",
  "ip_ideas": [{"title": "IP name", "format": "Show/Series/Podcast/Format", "concept": "what it is", "hook": "why people watch", "platforms": ["YouTube", "Instagram"], "monetization": "how it earns / franchise potential"}],
  "content_ideas": [{"title": "content idea", "format": "the format", "concept": "the concept"}],
  "campaign_ideas": [{"title": "campaign name", "concept": "the idea", "format": "the format", "platform": "primary platform", "viral_hook": "why it spreads"}],
  "recommendations": ["recommendation1", "recommendation2"]
}`,
};

function schemaFor(type: string): string {
  if (JSON_SCHEMAS[type]) return JSON_SCHEMAS[type];
  if (type === "competitor_analysis") return `{
  "summary": "2-3 sentence executive summary",
  "competitors": [{"name": "Company Name", "tagline": "their tagline", "market_position": "Leader/Challenger/Niche", "strengths": ["strength1", "strength2"], "weaknesses": ["weakness1"], "social_presence": "description", "recent_news": "latest development"}],
  "market_insights": ["insight1", "insight2", "insight3"],
  "opportunities": ["opportunity1", "opportunity2"],
  "threats": ["threat1", "threat2"],
  "competitive_landscape": "overall landscape description"
}`;
  if (type === "sentiment_analysis") return `{
  "summary": "2-3 sentence summary",
  "overall_score": 72, "positive_pct": 65, "neutral_pct": 20, "negative_pct": 15,
  "praised": [{"aspect": "aspect name", "detail": "specific example/quote"}],
  "criticized": [{"aspect": "aspect name", "detail": "specific example/complaint"}],
  "platform_sentiment": [{"platform": "LinkedIn", "score": 80, "summary": "professional perception"}, {"platform": "Reddit", "score": 55, "summary": "community discussion tone"}, {"platform": "News", "score": 70, "summary": "press coverage tone"}, {"platform": "Reviews", "score": 65, "summary": "customer review sentiment"}],
  "recent_events": ["event1", "event2"],
  "notable_quotes": ["real quote or paraphrase from public sources"],
  "recommendations": ["recommendation1", "recommendation2"]
}`;
  if (type === "social_media_listening") return `{
  "summary": "2-3 sentence summary",
  "platforms": [{"name": "Instagram", "handle": "@handle", "followers": "50K", "engagement": "3.2%", "content_type": "Reels, product shots", "posting_freq": "5x/week"}, {"name": "LinkedIn", "handle": "Company Page", "followers": "12K", "engagement": "2.1%", "content_type": "thought leadership", "posting_freq": "3x/week"}],
  "trending_hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "top_content_themes": ["theme1", "theme2", "theme3"],
  "viral_moments": [{"description": "what happened", "platform": "Instagram", "approx_reach": "500K"}],
  "audience_insights": "description of their audience",
  "content_gaps": ["gap1", "gap2"],
  "recommendations": ["recommendation1", "recommendation2"]
}`;
  return `{
  "summary": "2-3 sentence brand overview and campaign context",
  "brand_tonality": "description of voice, tone, style",
  "ideas": [{"title": "Campaign Name", "concept": "2-3 sentence description of the campaign idea", "format": "Reel Series", "platform": "Instagram + YouTube", "tagline": "Catchy tagline or hook", "viral_hook": "Why this would spread / what makes it shareable", "category": "Video Idea"}],
  "content_calendar_suggestion": "Suggested rollout approach"
}`;
}

// Close any open braces/brackets/strings so a truncated JSON blob still parses
function autoClose(s: string): string {
  const stack: string[] = [];
  let inStr = false, esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" && stack[stack.length - 1] === "{") stack.pop();
    else if (ch === "]" && stack[stack.length - 1] === "[") stack.pop();
  }
  let out = s;
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, "");
  while (stack.length) out += stack.pop() === "{" ? "}" : "]";
  return out;
}

// Robustly extract a JSON object from an LLM response (repairs trailing commas,
// strips control chars, and salvages truncated output by auto-closing).
function robustParseJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  const end = text.lastIndexOf("}");
  const raw = end > start ? text.slice(start, end + 1) : text.slice(start);
  const clean = (x: string) => x
    .replace(/,(\s*[}\]])/g, "$1")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  try { return JSON.parse(clean(raw)); } catch { /* try salvage */ }
  try { return JSON.parse(clean(autoClose(text.slice(start)))); } catch { /* give up */ }
  return null;
}

async function runAnalysis(brandName: string, links: string[], types: string[], month: string): Promise<Record<string, unknown>> {
  const linksContext = links.length > 0 ? `\n\nReference links for this brand:\n${links.join("\n")}` : "";

  const results: Record<string, unknown> = {};

  // Run each analysis type with its own focused Claude call + web search
  await Promise.all(types.map(async (type) => {
    let prompt = ANALYSIS_PROMPTS[type];
    if (!prompt) return;
    prompt = prompt.split(MONTH_TOKEN).join(month || "the upcoming month");

    const userPrompt = `Brand/Client: "${brandName}"${linksContext}

${prompt}

After thorough web research, return ONLY a valid JSON object (no markdown, no explanation outside JSON) with this structure for "${type}":

${schemaFor(type)}`;

    try {
      const messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];

      // Use web search for research types, direct for campaign ideas too but still search for brand context
      let response = await (anthropic.beta.messages.stream as Function)({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages,
        betas: ["web-search-2025-03-05"],
      }).finalMessage();

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

        response = await (anthropic.beta.messages.stream as Function)({
          model: "claude-sonnet-4-6",
          max_tokens: 16000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages,
          betas: ["web-search-2025-03-05"],
        }).finalMessage();
      }

      // Extract JSON from the final text response
      const text = response.content.filter((b: Anthropic.ContentBlock) => b.type === "text")
        .map((b: Anthropic.TextBlock) => b.text).join("");

      const parsed = robustParseJson(text);
      if (parsed) {
        results[type] = parsed;
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

  const { brand_name, links = [], analysis_types, month = "" } = await req.json() as {
    brand_name: string; links: string[]; analysis_types: string[]; month?: string;
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
    const results = await runAnalysis(brand_name, links, analysis_types, month);

    await service.from("research_reports").update({
      status: "done", result: results, completed_at: new Date().toISOString(),
    }).eq("id", report.id);

    return NextResponse.json({ id: report.id, status: "done", result: results });
  } catch (err) {
    await service.from("research_reports").update({ status: "error" }).eq("id", report.id);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
