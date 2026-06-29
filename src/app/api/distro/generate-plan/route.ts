import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brief, influencers, agency_margin } = body;

    if (!brief?.brand_name) {
      return NextResponse.json({ error: "brand_name is required" }, { status: 400 });
    }

    const budget = parseFloat(brief.total_budget || brief.budget || "0") || 0;
    const margin = typeof agency_margin === "number" ? agency_margin : 30;
    // Budget is client-facing (inclusive of margin) — reverse-calculate agency spend
    const targetSpend = Math.round(budget / (1 + margin / 100));
    const numPages = parseInt(brief.num_pages || "0") || 0;
    const numDeliverables = parseInt(brief.num_deliverables || "1") || 1;

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
    `- Handle: ${inf.handle_name}${inf.is_owned ? " [OWNED MEDIA — BCC in-house property, PREFER THIS]" : ""} | Category: ${inf.category} | Platform: ${inf.platform} | Followers: ${Number(inf.followers || 0).toLocaleString()} | Rates (INR): Post=₹${inf.rate_post || 0}, Reel=₹${inf.rate_reel || 0}, Story=₹${inf.rate_story || 0}, Combo=₹${inf.rate_combo || 0}`
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

    // Deliverable types constraint
    const allowedDeliverables = brief.deliverables
      ? brief.deliverables.split(",").map((s: string) => s.trim()).filter(Boolean)
      : [];
    const deliverableInstruction = allowedDeliverables.length > 0
      ? `DELIVERABLE TYPES: You MUST ONLY use these deliverable types — [${allowedDeliverables.join(", ")}]. Do NOT use any other type.`
      : `DELIVERABLE TYPES: Choose the most suitable deliverable type for each handle (Reel, Story, Post, Carousel, Collab Post, or Combo).`;

    const countInstruction = numPages > 0
      ? `- Select EXACTLY ${numPages} handles from the database (no more, no less — if the DB has fewer, use all available)`
      : `- Select 5–20 handles depending on what the DB has — quality over quantity`;

    const quantityInstruction = `- Each handle gets quantity: ${numDeliverables} (${numDeliverables} deliverable${numDeliverables > 1 ? "s" : ""} per handle)`;

    const prompt = `You are an expert social media distribution planner for BCC Media Network, an Indian marketing agency.

CLIENT BRIEF:
Brand: ${brief.brand_name}
Industry: ${brief.industry || "Not specified"}
Campaign Type: ${brief.campaign_type || "Brand Awareness"}
Total Client Budget: ₹${budget.toLocaleString()} (this is the client-facing total, inclusive of ${margin}% agency margin)
Media Spend (after ${margin}% margin): ₹${targetSpend.toLocaleString()} — this is what can actually be spent on pages/creators
Brief: ${briefText || "No detailed brief provided"}

CONTENT TYPE REQUIREMENT: ${contentTypeInstruction}
${deliverableInstruction}

YOUR TASK:
Select handles from the database below to build a media plan. Use ONLY handles that appear in the database. Do NOT invent new ones.
${countInstruction}
${quantityInstruction}
- total_cost = rate × quantity for each row
- Try to keep total agency spend (sum of all total_cost) within ₹${targetSpend.toLocaleString()}
- Handles with rate=0 (zero cost) CAN be included — they are owned media or barter deals; fill them in regardless of budget
- Match by category fit to the brand/industry
- Prefer geography match to ${geography} where state/location data is available
- OWNED MEDIA PRIORITY: Handles marked [OWNED MEDIA] are BCC in-house properties with zero acquisition cost — always prefer these first. Include at least 30–40% owned handles in the plan if they are category-relevant.

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
      "quantity": ${numDeliverables},
      "rate": 15000,
      "total_cost": ${15000 * numDeliverables}
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

      const qty = numDeliverables;
      const rate = exactRate ?? 0;
      return {
        ...row,
        quantity: qty,
        rate,
        total_cost: qty * rate,
        contact_no: dbRow.contact_no || row.contact_no || "",
        channel_link: dbRow.channel_link || "",
      };
    });

    return NextResponse.json({ plan, usedFallback: !hasDB });
  } catch (err: unknown) {
    console.error("generate-plan error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
