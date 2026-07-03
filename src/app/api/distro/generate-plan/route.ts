import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { brief, influencers: allInfluencers, agency_margin, excluded_handles } = body;
    // Filter out handles used in previous retainer months when policy is "cannot_repeat"
    const excludedSet = new Set<string>(
      (excluded_handles || []).map((h: string) => h.replace(/^@/, "").toLowerCase().trim())
    );
    const influencers = excludedSet.size > 0
      ? (allInfluencers as Record<string, unknown>[]).filter(inf =>
          !excludedSet.has(String(inf.handle_name || "").replace(/^@/, "").toLowerCase().trim())
        )
      : allInfluencers;

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

    const excludedNote = excludedSet.size > 0
      ? `\nEXCLUDED HANDLES (DO NOT use any of these — they were used in previous months): [${Array.from(excludedSet).join(", ")}]\n`
      : "";

    const influencerSection = `DISTRO HUB DATABASE (${influencers.length} entries — use ONLY these handles, do not invent new ones):${excludedNote}
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

    const deliverableDistInstruction = (numPages > 0 && numDeliverables > 0)
      ? `- TOTAL DELIVERABLES ACROSS ALL HANDLES: ${numDeliverables}
  - You have ${numPages} handles and ${numDeliverables} total deliverables to assign
  - Distribute intelligently: some handles get 1 deliverable, higher-reach or more relevant handles can get 2 or more
  - Vary deliverable types across handles where allowed (e.g. a handle gets 1 Reel + 1 Story = quantity 2 on separate rows, or Combo = 2 pieces on one row)
  - If ${numDeliverables} > ${numPages}: some handles get 2+ deliverables — assign extra deliverables to the most impactful handles
  - If ${numDeliverables} <= ${numPages}: most handles get 1 deliverable each, up to ${numDeliverables} handles total
  - The sum of all quantity fields in the plan MUST equal exactly ${numDeliverables}`
      : numDeliverables > 0
      ? `- Total deliverables to distribute: ${numDeliverables} — assign across selected handles intelligently`
      : `- Each handle gets 1 deliverable by default`;

    const prompt = `You are an expert social media distribution planner for BCC Media Network, an Indian marketing agency.

CLIENT BRIEF:
Brand: ${brief.brand_name}
Industry: ${brief.industry || "Not specified"}
Campaign Type: ${brief.campaign_type || "Brand Awareness"}
Total Client Budget: ₹${budget.toLocaleString()} (client-facing, inclusive of ${margin}% agency margin)
Media Spend available: ₹${targetSpend.toLocaleString()} (after ${margin}% margin is deducted)
Brief: ${briefText || "No detailed brief provided"}

CONTENT TYPE REQUIREMENT: ${contentTypeInstruction}
${deliverableInstruction}

YOUR TASK:
Select handles from the database below to build a media plan. Use ONLY handles that appear in the database. Do NOT invent new ones.
${countInstruction}
${deliverableDistInstruction}
- total_cost = rate × quantity for each row
- Try to keep total agency spend (sum of all total_cost) within ₹${targetSpend.toLocaleString()}
- Handles with rate=0 CAN be included — they are owned media or barter deals; include them regardless of budget (cost can be filled manually)
- Match by category fit to the brand/industry
- Prefer geography match to ${geography} where state/location data is available
- OWNED MEDIA PRIORITY: Handles marked [OWNED MEDIA] are BCC in-house properties — always prefer these first, include at least 30–40% if category-relevant.

${influencerSection}

Return ONLY valid JSON — no markdown, no explanation:
{
  "plan": [
    {
      "handle_name": "@handle_or_page_name",
      "platform": "instagram",
      "category": "Meme Page",
      "followers": "2.1M",
      "deliverable_type": "Reel",
      "quantity": 2,
      "rate": 15000,
      "total_cost": 30000
    }
  ]
}`;

    const message = await anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 32000,
      messages: [{ role: "user", content: prompt }],
    }).finalMessage();

    const text = (message.content[0] as { type: string; text: string }).text;
    const braceIdx = text.indexOf("{");
    if (braceIdx < 0) throw new Error("Claude did not return valid JSON");
    const lastBrace = text.lastIndexOf("}");
    const jsonMatch = [text.slice(braceIdx, lastBrace > braceIdx ? lastBrace + 1 : undefined)];

    // Repair common JSON issues: trailing commas, unescaped characters
    const repaired = jsonMatch[0]
      .replace(/,(\s*[}\]])/g, "$1")   // trailing commas before ] or }
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); // strip control characters (keep \n, \r, \t)

    let parsed: { plan?: Record<string, unknown>[] };
    try {
      parsed = JSON.parse(repaired);
    } catch {
      // Salvage: recover every complete row object even if the response was
      // truncated mid-array (e.g. hit the token limit)
      const planStart = repaired.indexOf('"plan"');
      const body = planStart >= 0 ? repaired.slice(planStart) : repaired;
      const rows: Record<string, unknown>[] = [];
      for (const objMatch of body.matchAll(/\{[^{}]*\}/g)) {
        try {
          const row = JSON.parse(objMatch[0]);
          if (row && typeof row === "object" && row.handle_name) rows.push(row);
        } catch { /* skip incomplete row */ }
      }
      if (rows.length === 0) throw new Error(`JSON parse failed: ${repaired.slice(0, 300)}`);
      parsed = { plan: rows };
    }

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
      return {
        ...row,
        quantity: qty,
        rate,
        total_cost: qty * rate,
        contact_no: dbRow.contact_no || row.contact_no || "",
        channel_link: dbRow.channel_link || "",
      };
    });

    // HARD BUDGET CAP: client cost = agency spend x (1 + margin). Never exceed
    // the entered budget — drop paid rows from the end until we fit.
    // Rate-0 rows (owned media / barter) are free and always kept.
    let spend = plan.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.total_cost) || 0), 0);
    const capped = [...plan];
    if (spend > targetSpend) {
      for (let i = capped.length - 1; i >= 0 && spend > targetSpend; i--) {
        const cost = Number(capped[i].total_cost) || 0;
        if (cost <= 0) continue;
        spend -= cost;
        capped.splice(i, 1);
      }
    }

    return NextResponse.json({
      plan: capped,
      usedFallback: !hasDB,
      trimmed: capped.length < plan.length ? plan.length - capped.length : 0,
      agency_spend: spend,
      client_cost: Math.round(spend * (1 + margin / 100)),
    });
  } catch (err: unknown) {
    console.error("generate-plan error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
