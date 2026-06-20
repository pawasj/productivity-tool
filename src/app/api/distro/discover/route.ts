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
    const { brief, platforms = ["instagram", "youtube", "linkedin"], geo = "", language = "" } = body;
    if (!brief?.brand_name) return NextResponse.json({ error: "brand_name required" }, { status: 400 });

    const contentType = brief.content_type || "both";
    const geography = brief.target_geography || "India";
    const isRegional = !!(geo || language);

    const typeLabel = contentType === "creators"
      ? "individual content creators and influencers"
      : contentType === "pages"
      ? "community pages, meme pages, newsletters, subreddits, and mass-reach accounts"
      : "content creators, influencers, community pages, and newsletters";

    const platformList = (platforms as string[]).join(", ").toUpperCase();
    const platformGuide = buildPlatformSearchPlan(platforms, brief, contentType);

    // Build the regional/language constraint section
    const regionalConstraint = isRegional ? `
═══ REGIONAL / LANGUAGE FILTER — THIS IS MANDATORY ═══
${geo ? `GEOGRAPHY FILTER: "${geo}"
- ONLY return creators/pages who are BASED IN or primarily cover "${geo}"
- This means: their audience, content, language, and follower base should be predominantly from ${geo}
- For YouTube/Instagram: look specifically for "${geo} creator", "${geo} influencer", "${geo} page" in your searches
- For Reddit: look for r/${geo.toLowerCase().replace(/\s+/g, "")} or regional subreddits
- For LinkedIn: look for professionals based in ${geo}
- For newsletters: look for "${geo} newsletter" or publications covering ${geo}
- Do NOT include pan-India creators unless they have a strong ${geo} focus
- Mark the location field clearly as "${geo}" for all results` : ""}
${language ? `LANGUAGE FILTER: "${language}"
- ONLY return creators/pages who create content PRIMARILY in ${language}
- Search explicitly for "${language} creator", "${language} YouTuber", "${language} Instagram", "${language} content creator"
- For YouTube: look for channels where the majority of videos are in ${language}
- For Instagram: look for captions/reels in ${language}
- For newsletters/Substack: look for ${language}-language publications
- For Reddit: look for ${language}-language communities or subreddits
- Pan-India accounts who sometimes post in ${language} do NOT qualify — must be primarily ${language}
- Mark the category field with "${language} Content" or "${language} Creator" to clearly identify them` : ""}
STRICT ENFORCEMENT: If you cannot verify that a result satisfies the ${geo ? `${geo} geography` : `${language} language`} filter, do NOT include it. It is better to return 6 highly relevant regional results than 15 mixed results. Quality over quantity for regional searches.` : "";

    // Build niche/domain context
    const nicheContext = `
═══ NICHE / DOMAIN FOCUS ═══
Industry: ${brief.industry || "General"}
Campaign Type: ${brief.campaign_type || "Brand Awareness"}
Target Audience: ${brief.target_audience || "General"}
Campaign Objective: ${brief.campaign_objective || "Not specified"}
Additional Context: ${brief.additional_notes || "None"}

NICHE MATCHING RULES:
- Prioritize accounts whose content niche DIRECTLY matches "${brief.industry || "the brand's industry"}"
- Secondary: accounts with audience demographics matching "${brief.target_audience || "the target audience"}"
- For a ${brief.campaign_type || "brand awareness"} campaign, prefer accounts known for ${brief.campaign_type === "Product Launch" ? "product reviews and unboxing" : brief.campaign_type === "Lead Generation" ? "educational content and tutorials" : brief.campaign_type === "Engagement" ? "interactive content, polls, memes" : "storytelling and brand integration"}
- Do NOT include generic lifestyle or entertainment accounts unless they have a clear ${brief.industry || "relevant"} niche crossover`;

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
${nicheContext}
${regionalConstraint}

═══ PLATFORMS TO SEARCH ═══
${platformList}

═══ RESEARCH METHODOLOGY — follow this exactly ═══
${platformGuide}

${isRegional ? `REGIONAL SEARCH QUERIES TO USE:
${geo ? `- "${geo} ${brief.industry || ""} creator"
- "${geo} influencer top accounts"
- "${geo} meme page Instagram"
- "top ${brief.industry || ""} YouTubers from ${geo}"
- "${geo} based content creator brand collaboration"` : ""}
${language ? `- "${language} YouTuber India top channels"
- "${language} Instagram creator influencer"
- "${language} content creator brand collab"
- "top ${brief.industry || ""} creators ${language} content"
- "${language} newsletter India"` : ""}
Run these searches IN ADDITION to the platform-specific methodology above.` : ""}

═══ SEARCH STRATEGY ═══
For EACH selected platform, run 2–3 targeted web searches. ${isRegional ? `ALWAYS include the ${geo || language} filter term in your search queries.` : ""} After gathering results, cross-reference and verify follower counts. Prefer results from:
- Social Blade, Hypeauditor, Influencer.in
- Recent media articles (2023–2025) about Indian social media
- Creator economy reports for India
- Platform-specific discover/explore pages

IMPORTANT RULES:
1. Only include accounts you have VERIFIED through search results — never fabricate handles
2. ${isRegional ? `STRICT: Every result MUST satisfy the ${geo ? `"${geo}" geography` : `"${language}" language`} filter — no exceptions` : "Include a mix of mega (1M+), macro (100K–1M), and micro (10K–100K) accounts"}
3. For each result, include the EXACT profile URL
4. Engagement rate matters more than raw follower count
5. ${contentType === "pages" ? "Focus on PAGES and COMMUNITIES, not individual people." : contentType === "creators" ? "Focus on INDIVIDUAL content creators, not brand pages." : "Include a healthy mix of creators and community pages."}
6. Each result must be relevant to: ${brief.industry || "the brand's industry"} · ${brief.target_audience || "the target audience"}

After all searches, compile ${isRegional ? "8–14" : "12–18"} best matches and return ONLY a JSON object (no markdown fences, no extra text):
{
  "results": [
    {
      "handle_name": "@exact_handle_or_page_name",
      "platform": "instagram",
      "category": "${isRegional && geo ? `${geo} ` : isRegional && language ? `${language} ` : ""}Creator / Page / Newsletter / etc.",
      "followers": "2.3M",
      "engagement_rate": "4.2%",
      "location": "${geo || "India"}",
      "contact": "email or DM if found",
      "rationale": "Specific reason this account matches the ${brief.brand_name} campaign${isRegional ? ` — MUST mention why this is ${geo || language + "-language"} specific` : ""}",
      "match_score": "High",
      "profile_url": "https://instagram.com/handle",
      "type": "page"
    }
  ]
}

match_score: "High" = strong niche, audience AND ${isRegional ? `regional (${geo || language}) ` : ""}alignment; "Medium" = good fit with minor gaps; "Low" = reach justifies inclusion.
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
      const body2 = await req.clone().json().catch(() => ({})) as { brief?: Record<string, string>; platforms?: string[]; geo?: string; language?: string };
      return await fallbackDiscovery(body2.brief || {}, "both", "India", body2.platforms || ["instagram", "youtube", "linkedin"], body2.geo || "", body2.language || "");
    } catch {
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }
}

async function fallbackDiscovery(brief: Record<string, string>, contentType: string, geography: string, platforms: string[], geo = "", language = "") {
  const platformList = platforms.join(", ").toUpperCase();
  const isRegional = !!(geo || language);
  const regionalNote = geo
    ? `IMPORTANT: Only include creators/pages who are based in or primarily cover ${geo}. Do not include pan-India accounts.`
    : language
    ? `IMPORTANT: Only include creators who make content primarily in ${language}. Do not include creators who merely occasionally post in ${language}.`
    : "";

  const prompt = `You are a senior influencer marketing strategist with deep knowledge of the Indian social media landscape across ${platformList}.

CAMPAIGN BRIEF:
Brand: ${brief.brand_name || "Unknown Brand"}
Industry: ${brief.industry || "Not specified"}
Campaign Type: ${brief.campaign_type || "Not specified"}
Target Audience: ${brief.target_audience || "Not specified"}
Campaign Objective: ${brief.campaign_objective || "Not specified"}
Geography: ${geography}
Content Type: ${contentType}
Platforms: ${platformList}
${isRegional ? `\nREGIONAL FILTER: ${geo ? `State/City = ${geo}` : `Language = ${language}`}\n${regionalNote}` : ""}

Based on your knowledge of real accounts on ${platformList}, suggest ${isRegional ? "8–12" : "12–15"} ${contentType === "pages" ? "community pages, subreddits, newsletters" : contentType === "creators" ? "content creators and influencers" : "creators and community pages"} suitable for this campaign.
${isRegional ? `\nAll results MUST be ${geo ? `based in or focused on ${geo}` : `primarily creating content in ${language}`}. This is a hard requirement.` : "Include accounts from EACH of the following platforms: " + platformList}

Only include real, well-known accounts. State clearly in the rationale if follower data is approximate.
${isRegional ? `For each result, explicitly explain in the rationale WHY this account qualifies as ${geo || language + "-language"} specific.` : ""}

Return ONLY valid JSON (no markdown):
{
  "results": [
    {
      "handle_name": "@handle_or_community_name",
      "platform": "instagram",
      "category": "${isRegional && geo ? geo + " Creator" : isRegional && language ? language + " Content Creator" : "Meme Page"}",
      "followers": "~2.5M (approx)",
      "engagement_rate": "~3–5%",
      "location": "${geo || "India"}",
      "contact": "",
      "rationale": "Why this matches the brief${isRegional ? ` and why they are ${geo || language + "-language"} specific` : ""}",
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
