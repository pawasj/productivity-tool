import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brief, influencers } = body;

    if (!brief?.brand_name) {
      return NextResponse.json({ error: "brand_name is required" }, { status: 400 });
    }

    const budget = parseFloat(brief.total_budget || brief.budget || "0") || 0;
    const targetSpend = Math.round(budget * 0.48);

    const hasDB = influencers && influencers.length > 0;

    if (!hasDB) {
      return NextResponse.json({
        plan: [],
        empty_db: true,
        message: "Your Distro Hub database has no matching entries for this content type. Add creators/pages to the database first, or use the Discovery feature to find new ones.",
      });
    }

    const influencerSection = `DISTRO HUB DATABASE (${influencers.length} entries — use ONLY these handles, do not invent new ones):
${influencers
  .slice(0, 200)
  .map((inf: Record<string, unknown>) =>
    `- Handle: ${inf.handle_name} | Category: ${inf.category} | Platform: ${inf.platform} | Followers: ${Number(inf.followers || 0).toLocaleString()} | Rates (INR): Post=₹${inf.rate_post || 0}, Reel=₹${inf.rate_reel || 0}, Story=₹${inf.rate_story || 0}, Story=₹${inf.rate_story || 0}, Combo=₹${inf.rate_combo || 0}`
  )
  .join("\n")}`;

    const contentType = brief.content_type || "both";
    const geography = brief.target_geography || "India";
    const engagementModel = brief.engagement_model === "retainer" ? "Monthly Retainer" : "One-time Campaign";

    const briefText = [
      brief.campaign_objective,
      `Audience: ${brief.target_audience || "Not specified"}`,
      `Geography: ${geography}`,
      `Engagement: ${engagementModel}`,
      brief.timeline && `Timeline: ${brief.timeline}`,
      brief.deliverables && `Deliverables: ${brief.deliverables}`,
      brief.additional_notes && `Notes: ${brief.additional_notes}`,
    ].filter(Boolean).join("\n");

    const contentTypeInstruction = contentType === "creators"
      ? "Include ONLY individual content creators and influencers — no community or meme pages."
      : contentType === "pages"
      ? "Include ONLY community pages, meme pages, and mass-reach pages — no individual creators."
      : "Include a mix of individual creators AND community/meme pages.";

    const prompt = `You are an expert social media distribution planner for BCC Media Network, an Indian marketing agency.

CLIENT BRIEF:
Brand: ${brief.brand_name}
Industry: ${brief.industry || "Not specified"}
Campaign Type: ${brief.campaign_type || "Brand Awareness"}
Total Budget: ₹${budget.toLocaleString()}
Brief: ${briefText || "No detailed brief provided"}

CONTENT TYPE REQUIREMENT: ${contentTypeInstruction}

YOUR TASK:
Select the best handles from the database above to build a media plan.
IMPORTANT: You must ONLY use handles that appear in the database above. Do NOT suggest handles that are not in the list.
- Target spend: ₹${targetSpend.toLocaleString()} (48% of budget — agency keeps 52%)
- Select 5–20 handles depending on what the DB has — quality over quantity
- Match by category fit to the brand/industry
- Prefer geography match to ${geography} where state/location data is available
- Mix follower tiers where possible

${influencerSection}

Return ONLY valid JSON — no markdown fences, no explanation outside JSON:
{
  "plan": [
    {
      "handle_name": "@handle_or_page_name",
      "platform": "instagram",
      "category": "Meme Page",
      "followers": "2.1M",
      "deliverable_type": "Reel",
      "quantity": 1,
      "rate": 15000,
      "total_cost": 15000
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
    if (!jsonMatch) throw new Error("Claude did not return valid JSON");
    const parsed = JSON.parse(jsonMatch[0]);

    // Build a fast lookup: handle_name → influencer DB row
    const dbMap = new Map<string, Record<string, unknown>>();
    for (const inf of (influencers as Record<string, unknown>[])) {
      const key = String(inf.handle_name || "").replace(/^@/, "").toLowerCase().trim();
      dbMap.set(key, inf);
    }

    // Overwrite rates directly from the DB — no hallucination possible
    const plan = (parsed.plan || []).map((row: Record<string, unknown>) => {
      const key = String(row.handle_name || "").replace(/^@/, "").toLowerCase().trim();
      const dbRow = dbMap.get(key);
      if (!dbRow) return row; // unknown handle, keep as-is

      const deliverable = String(row.deliverable_type || "").toLowerCase();
      let exactRate: number | null = null;

      if (deliverable.includes("reel"))         exactRate = Number(dbRow.rate_reel)        || null;
      else if (deliverable.includes("story"))   exactRate = Number(dbRow.rate_story)       || null;
      else if (deliverable.includes("collab"))  exactRate = Number(dbRow.rate_collab_post) || null;
      else if (deliverable.includes("carousel"))exactRate = Number(dbRow.rate_carousel)    || null;
      else if (deliverable.includes("combo"))   exactRate = Number(dbRow.rate_combo)       || null;
      else if (deliverable.includes("post"))    exactRate = Number(dbRow.rate_post)        || null;
      // fallback: first non-zero rate in order of preference
      else exactRate =
        Number(dbRow.rate_reel) ||
        Number(dbRow.rate_post) ||
        Number(dbRow.rate_story) ||
        Number(dbRow.rate_collab_post) ||
        Number(dbRow.rate_carousel) ||
        Number(dbRow.rate_combo) ||
        0;

      const qty = Number(row.quantity) || 1;
      const rate = exactRate ?? 0;
      return { ...row, rate, total_cost: qty * rate };
    });

    return NextResponse.json({ plan, usedFallback: !hasDB });
  } catch (err: unknown) {
    console.error("generate-plan error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
