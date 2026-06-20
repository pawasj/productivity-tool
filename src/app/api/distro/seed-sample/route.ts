import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

const SAMPLE_PLAN = [
  { handle_name: "@sarcasm_only", platform: "instagram", category: "Meme Page", followers: "3.2M", deliverable_type: "Reel", quantity: 2, rate: 18000, total_cost: 36000 },
  { handle_name: "@theinstasaver", platform: "instagram", category: "Meme Page", followers: "1.8M", deliverable_type: "Post", quantity: 2, rate: 8000, total_cost: 16000 },
  { handle_name: "@beerbiceps", platform: "instagram", category: "Health & Fitness", followers: "4.1M", deliverable_type: "Reel", quantity: 1, rate: 45000, total_cost: 45000 },
  { handle_name: "@shitpostingclub", platform: "instagram", category: "Pop Culture", followers: "2.6M", deliverable_type: "Story", quantity: 3, rate: 6000, total_cost: 18000 },
  { handle_name: "@goodtimes_india", platform: "instagram", category: "Motivational", followers: "900K", deliverable_type: "Post", quantity: 2, rate: 5000, total_cost: 10000 },
  { handle_name: "@hinglishhumor", platform: "instagram", category: "Comedy", followers: "1.2M", deliverable_type: "Reel", quantity: 1, rate: 12000, total_cost: 12000 },
  { handle_name: "@startupindia_official", platform: "instagram", category: "Business & Tech", followers: "800K", deliverable_type: "Carousel", quantity: 2, rate: 8000, total_cost: 16000 },
  { handle_name: "@cricketkaadda", platform: "instagram", category: "Cricket / Sports", followers: "1.5M", deliverable_type: "Post", quantity: 2, rate: 10000, total_cost: 20000 },
];

const SAMPLE_NARRATIVE = `# Samsung India — Internet Distribution Narrative

## Brand Context
Samsung India is one of the most trusted electronics and mobile brands in the country, with deep penetration across metro and tier-2 markets. The internet must experience Samsung as the bold innovator that understands the modern Indian's desire for smarter living — not just another phone company, but a cultural partner in their digital journey.

## Campaign Philosophy
This campaign should feel like a conversation, not an announcement. Every piece of content must earn attention through relevance, humour, or aspiration — never through force. It should NOT feel like a corporate product push or feel disconnected from the culture of the platform it lives on.

## Narrative Buckets

### 1. The Smart Switch
**Core Thought**: Upgrading to Samsung feels like leveling up in life.
**What Makes It Different**: Speaks to the aspirational mid-market without being condescending.
**Content Direction**: Before/after format reels, "that moment when…" content, transformation arcs using Galaxy features.

### 2. Made for India
**Core Thought**: Samsung Galaxy is built for the way Indians actually use their phones.
**What Makes It Different**: Celebrates Indian use-cases — UPI payments, cricket streaming, regional language support.
**Content Direction**: Creator-led day-in-the-life content, relatable Indian scenarios (power cuts, dusty cities, hot summers).

### 3. Galaxy Culture
**Core Thought**: The phone you carry says something about who you are.
**What Makes It Different**: Aspirational without being out of reach.
**Content Direction**: Aesthetic unboxings, creator collabs, style-forward content with Galaxy as the centrepiece.

## Perception Build Journey

**Phase 1 — Awareness (Weeks 1–2)**
Objective: Flood the feed with culturally relevant Samsung content.
Narratives: Smart Switch + Made for India
Content: High-volume meme pages, pop culture handles, reels with trending audio.
Outcome: 50M+ impressions, brand recall spike.

**Phase 2 — Credibility (Weeks 3–4)**
Objective: Build trust through creator endorsements and feature demonstration.
Narratives: Made for India + Galaxy Culture
Content: Mid-tier tech and lifestyle creators doing honest reviews and use-case demos.
Outcome: 10%+ engagement rate on key posts, positive comment sentiment.

**Phase 3 — Authority (Week 5–6)**
Objective: Cement Samsung as the default upgrade choice.
Narratives: All three buckets converge
Content: Macro creators, UGC amplification, community engagement.
Outcome: Brand search volume increase, DM-driven conversion intent.

## Platform Strategy
**Instagram**: Primary platform. Mix of Reels (awareness), Carousels (feature education), Stories (FOMO/urgency). Tone: fun, punchy, visual-first.
**YouTube**: Long-form creator integrations for deep product demos. Tone: authentic, informative.
**LinkedIn**: B2B angle — Samsung business solutions, enterprise features. Tone: professional, aspirational.

## Content Formats & Hook Ideas
1. **"Switch Check"** — "Changed my phone, changed my life" transformation reel
2. **"Only in India"** — Relatable Indian phone usage scenarios featuring Galaxy
3. **"Galaxy or Nothing"** — Creator POV: why they chose Samsung for their content creation
4. **"1 Day, 1 Galaxy"** — Day-in-the-life showing Galaxy features naturally
5. **"The Upgrade Test"** — Side-by-side old phone vs Galaxy Galaxy in real Indian conditions

## Success Metrics
- Reach: 80M+ across all handles
- Engagement Rate: 4%+ average
- Brand Mentions: 3x baseline in campaign period
- Story Click-throughs: 8%+ CTR to product page
- Share of Voice: Track vs Realme/OnePlus in social conversations`;

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data, error } = await supabase.from("client_briefs").insert({
      brand_name: "Samsung India",
      brand_poc: "Rahul Kapoor",
      poc_name: "Rahul Kapoor",
      industry: "Tech",
      campaign_type: "Brand Awareness",
      engagement_type: "one_time",
      budget: 5000000,
      total_budget: 5000000,
      target_audience: "Urban Indians 18–35",
      campaign_objective: "Launch Galaxy S25 Series with mass awareness and cultural relevance across Instagram",
      timeline: "June–July 2025, 6 weeks",
      deliverables: "Reels, Posts, Stories, Carousels",
      brief: "Launch campaign for Galaxy S25 Series targeting urban millennials across India",
      media_plan_json: SAMPLE_PLAN,
      narrative_text: SAMPLE_NARRATIVE,
      status: "draft",
      created_by: user.id,
      source: "distro",
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: (data as Record<string, string>).id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
