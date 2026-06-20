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

const PLATFORM_RESEARCH_GUIDE: Record<string, string> = {
  instagram: `INSTAGRAM: Search for "top Indian [category] creators Instagram 2024 2025", "[niche] meme pages India Instagram followers", "[brand industry] influencers India Instagram engagement". Look for verified handle names, bio descriptions, follower counts from recent articles, creator economy reports, and social media ranking sites like Social Blade, Hypeauditor, Influencer.in.`,
  youtube: `YOUTUBE: Search for "top [category] YouTube channels India subscribers 2024", "[industry] YouTubers India", "[niche] Hindi/English YouTube content creators India". Use YouTube search terms, check Vidooly, Social Blade rankings, and media coverage. Include channel subscriber counts and video view averages.`,
  linkedin: `LINKEDIN: Search for "[industry] thought leaders India LinkedIn", "top Indian [profession] LinkedIn influencer 2024", "[sector] executives India LinkedIn top voices". Focus on professionals with large follower bases, LinkedIn Top Voices badge holders, and subject matter experts. Include their professional title and company.`,
  reddit: `REDDIT: Search for "top Indian subreddits [category]", "r/India r/[topic] popular communities", "Reddit India [niche] community size". Identify relevant subreddits (community pages), their subscriber counts, and active moderators/contributors. For "creators" on Reddit, look for prolific community contributors and moderators.`,
  x: `X (TWITTER): Search for "top Indian [industry] Twitter accounts 2024", "[niche] Twitter influencers India followers", "[brand sector] thought leaders Twitter India". Look for high-follower accounts, frequent posters, accounts with strong engagement ratios. Include verified (blue tick) accounts where possible.`,
  newsletter: `NEWSLETTER/SUBSTACK: Search for "top Indian newsletters Substack 2024", "[industry] newsletter India subscribers", "Indian [niche] email newsletter creator". Look for Substack India creators, newsletter roundups, Morning Context, The Ken India, and niche newsletters. Include subscriber counts and publication frequency.`,
  website: `WEBSITE/BLOG: Search for "top Indian [industry] bloggers 2024", "[niche] website India traffic", "popular Indian [category] blog domain authority". Look for high-traffic websites, Alexa/SimilarWeb rankings, and influential content platforms in the niche.`,
};

function buildPlatformSearchPlan(platforms: string[], brief: Record<string, string>, contentType: string): string {
  const selected = platforms.filter(p => PLATFORM_RESEARCH_GUIDE[p]);
  if (selected.length === 0) return "Search across Instagram, YouTube, LinkedIn for Indian influencers.";

  return selected.map(p => PLATFORM_RESEARCH_GUIDE[p]).join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brief, platforms = ["instagram", "youtube", "linkedin"] } = body;
    if (!brief?.brand_name) return NextResponse.json({ error: "brand_name required" }, { status: 400 });

    const contentType = brief.content_type || "both";
    const geography = brief.target_geography || "India";

    const typeLabel = contentType === "creators"
      ? "individual content creators and influencers"
      : contentType === "pages"
      ? "community pages, meme pages, newsletters, subreddits, and mass-reach accounts"
      : "content creators, influencers, community pages, and newsletters";

    const platformList = (platforms as string[]).join(", ").toUpperCase();
    const platformGuide = buildPlatformSearchPlan(platforms, brief, contentType);

    const prompt = `You are a senior influencer marketing strategist at BCC Media Network, an Indian digital media agency. Your job is to find REAL, VERIFIED ${typeLabel} across ${platformList} for the following campaign.

═══ CAMPAIGN BRIEF ═══
Brand: ${brief.brand_name}
Industry: ${brief.industry || "Not specified"}
Campaign Type: ${brief.campaign_type || "Brand Awareness"}
Objective: ${brief.campaign_objective || "Not specified"}
Target Audience: ${brief.target_audience || "General"}
Geography: ${geography}
Content Mix: ${contentType === "creators" ? "Creators & Influencers ONLY" : contentType === "pages" ? "Community Pages & Mass Accounts ONLY" : "Both Creators and Community Pages"}
Budget: ₹${parseFloat(brief.total_budget || "0").toLocaleString("en-IN") || "Not specified"}
Deliverables: ${brief.deliverables || "Not specified"}
Additional Notes: ${brief.additional_notes || "None"}

═══ PLATFORMS TO SEARCH ═══
${platformList}

═══ RESEARCH METHODOLOGY — follow this exactly ═══
${platformGuide}

═══ SEARCH STRATEGY ═══
For EACH selected platform, run 2–3 targeted web searches using the search queries described above. Do NOT skip any platform. After gathering results, cross-reference and verify follower counts. Prefer results from:
- Official platform analytics tools (Social Blade, Hypeauditor, Influencer.in)
- Recent media articles (2023–2025) about Indian social media rankings
- Creator economy reports for India
- Platform-specific discover/explore pages

IMPORTANT RULES:
1. Only include accounts you have VERIFIED through search results — never fabricate handles
2. Include a mix of mega (1M+), macro (100K–1M), and micro (10K–100K) accounts for a balanced plan
3. For each result, include the EXACT profile URL (e.g., instagram.com/handle, linkedin.com/in/name, reddit.com/r/subreddit, substack.com/author)
4. Engagement rate matters more than raw follower count — flag accounts with notably high engagement
5. ${contentType === "pages" ? "Focus on PAGES and COMMUNITIES, not individual people." : contentType === "creators" ? "Focus on INDIVIDUAL content creators, not brand pages." : "Include a healthy mix of creators and community pages."}
6. Each result must be relevant to: ${brief.industry || "the brand's industry"} and targeted at ${brief.target_audience || "the target audience"}

After all searches, compile 12–18 best matches and return ONLY a JSON object (no markdown fences, no extra text):
{
  "results": [
    {
      "handle_name": "@exact_handle_or_page_name",
      "platform": "instagram",
      "category": "Meme Page / Tech Creator / Finance Newsletter / etc.",
      "followers": "2.3M",
      "engagement_rate": "4.2%",
      "location": "Mumbai, Maharashtra",
      "contact": "email or DM if found",
      "rationale": "Specific reason this account matches the ${brief.brand_name} campaign brief — mention audience overlap, content style, past brand collaborations if known",
      "match_score": "High",
      "profile_url": "https://instagram.com/handle",
      "type": "page"
    }
  ]
}

match_score: "High" = strong audience & content alignment; "Medium" = good fit with minor gaps; "Low" = reach justifies inclusion despite lower alignment.
type: "creator" for individual people, "page" for communities/channels/newsletters/subreddits.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 10000,
      tools: [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
        },
      ],
      messages: [{ role: "user", content: prompt }],
    });

    let finalText = "";
    for (const block of message.content) {
      if (block.type === "text") finalText += block.text;
    }

    const jsonMatch = finalText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return await fallbackDiscovery(brief, contentType, geography, platforms);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const results: DiscoveryResult[] = (parsed.results || []).filter(
      (r: DiscoveryResult) => r.handle_name && r.platform && r.rationale
    );

    return NextResponse.json({ results, source: "web_search" });
  } catch (err: unknown) {
    console.error("discover error:", err);
    try {
      const body2 = await req.clone().json().catch(() => ({})) as { brief?: Record<string, string>; platforms?: string[] };
      return await fallbackDiscovery(body2.brief || {}, "both", "India", body2.platforms || ["instagram", "youtube", "linkedin"]);
    } catch {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }
}

async function fallbackDiscovery(brief: Record<string, string>, contentType: string, geography: string, platforms: string[]) {
  const platformList = platforms.join(", ").toUpperCase();
  const prompt = `You are a senior influencer marketing strategist with deep knowledge of the Indian social media landscape across ${platformList}.

CAMPAIGN BRIEF:
Brand: ${brief.brand_name || "Unknown Brand"}
Industry: ${brief.industry || "Not specified"}
Target Audience: ${brief.target_audience || "Not specified"}
Geography: ${geography}
Content Type: ${contentType}
Platforms: ${platformList}

Based on your knowledge of real accounts on ${platformList}, suggest 12–15 ${contentType === "pages" ? "community pages, subreddits, newsletters" : contentType === "creators" ? "content creators and influencers" : "creators and community pages"} suitable for this campaign.

Include accounts from EACH of the following platforms: ${platformList}
For Reddit: include r/subreddit names. For Substack/Newsletter: include newsletter names.

Only include real, well-known accounts. State clearly in the rationale if follower data is approximate.

Return ONLY valid JSON (no markdown):
{
  "results": [
    {
      "handle_name": "@handle_or_community_name",
      "platform": "instagram",
      "category": "Meme Page",
      "followers": "~2.5M (approx)",
      "engagement_rate": "~3–5%",
      "location": "India",
      "contact": "",
      "rationale": "Why this matches the brief",
      "match_score": "High",
      "profile_url": "https://instagram.com/handle",
      "type": "page"
    }
  ]
}`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  });

  const text = (message.content[0] as { type: string; text: string }).text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return NextResponse.json({ results: [], source: "fallback" });

  const parsed = JSON.parse(jsonMatch[0]);
  return NextResponse.json({
    results: parsed.results || [],
    source: "ai_knowledge",
    disclaimer: "Results based on AI training data — verify before use.",
  });
}
