import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { brief, plan } = await req.json();

    if (!brief?.brand_name) {
      return NextResponse.json({ error: "brand_name is required" }, { status: 400 });
    }

    const budget = parseFloat(brief.total_budget || brief.budget || "0") || 0;

    const planSummary = plan?.length
      ? `\nMEDIA PLAN SUMMARY (${plan.length} handles, ₹${plan.reduce((s: number, r: Record<string, unknown>) => s + (Number(r.total_cost) || 0), 0).toLocaleString()} spend):\n` +
        plan.slice(0, 10).map((r: Record<string, unknown>) => `- ${r.handle_name} (${r.platform}, ${r.category}) — ${r.deliverable_type} x${r.quantity}`).join("\n")
      : "";

    const prompt = `You are a senior brand strategist and narrative architect at BCC Media Network, a top Indian social media agency.

CLIENT BRIEF:
Brand: ${brief.brand_name}
Industry: ${brief.industry || "Not specified"}
Campaign Type: ${brief.campaign_type || "Brand Awareness"}
Budget: ₹${budget.toLocaleString()}
Objective: ${brief.campaign_objective || "Not specified"}
Target Audience: ${brief.target_audience || "Not specified"}
Timeline: ${brief.timeline || "Not specified"}
Deliverables: ${brief.deliverables || "Not specified"}
Notes: ${brief.additional_notes || "None"}
${planSummary}

Write a comprehensive internet distribution narrative document. Use this exact structure:

# ${brief.brand_name} — Internet Distribution Narrative

## Brand Context
[2–3 sentences on brand positioning and what we want the internet to feel about this brand]

## Campaign Philosophy
[Core spirit of the campaign — what it should feel like, what it should NOT feel like]

## Narrative Buckets
[3–5 core narrative themes. For each:]
### [Bucket Name]
- **Core Thought**: [One line]
- **What Makes It Different**: [One line]
- **Content Direction**: [Content types, angles, hooks]

## Perception Build Journey
Phase 1 — Awareness: [Timeline, objective, key narratives, content focus, expected outcome]
Phase 2 — Credibility: [Timeline, objective, key narratives, content focus, expected outcome]
Phase 3 — Authority: [Timeline, objective, key narratives, content focus, expected outcome]

## Platform Strategy
[For each relevant platform — Instagram, LinkedIn, YouTube, X]
**[Platform]**: Role | Content types | Tone

## Content Formats & Hook Ideas
[5–6 specific content format ideas with example hooks]

## Key Message Matrix
[3–4 core messages with: Message | Target Audience | Platform | Tone]

## Success Metrics
[KPIs: reach, engagement rate, brand mentions, sentiment, share of voice, etc.]

Write in confident agency voice. Be specific to this brand. No generic filler.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const narrative = (message.content[0] as { type: string; text: string }).text;
    return NextResponse.json({ narrative });
  } catch (err: unknown) {
    console.error("generate-narrative error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
