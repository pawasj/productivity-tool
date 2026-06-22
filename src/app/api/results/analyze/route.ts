import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface LinkInput {
  handle_name: string;
  platform: string;
  live_link: string;
  deliverable_type?: string;
}

interface LinkMetrics {
  handle_name: string;
  platform: string;
  live_link: string;
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  engagement?: number;
  extra_note?: string;
  fetch_status: "ok" | "partial" | "unavailable";
  fetched_at: string;
}

// ─── YouTube ──────────────────────────────────────────────────────────────────
// Parses view count from the ytInitialData JSON blob embedded in the page HTML.
// This is publicly available without login for any public YouTube video.
async function fetchYouTube(url: string): Promise<Partial<LinkMetrics> | null> {
  try {
    const idMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if (!idMatch) return null;
    const videoId = idMatch[1];

    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const viewMatch = html.match(/"viewCount":"(\d+)"/);
    const likeMatch = html.match(/"likeCount":"(\d+)"/);
    const commentMatch = html.match(/"commentCount":"(\d+)"/);

    if (!viewMatch) return { fetch_status: "partial", extra_note: "YouTube page loaded but viewCount not found (video may be private)" };

    const views = parseInt(viewMatch[1]);
    const likes = likeMatch ? parseInt(likeMatch[1]) : undefined;
    const comments = commentMatch ? parseInt(commentMatch[1]) : undefined;

    return {
      views,
      likes,
      comments,
      engagement: (likes || 0) + (comments || 0) || undefined,
      fetch_status: "ok",
      extra_note: "Live data from YouTube",
    };
  } catch {
    return null;
  }
}

// ─── Reddit ───────────────────────────────────────────────────────────────────
// Reddit has a free public JSON API — append .json to any post URL.
async function fetchReddit(url: string): Promise<Partial<LinkMetrics> | null> {
  try {
    const cleanUrl = url.replace(/\?.*/, "").replace(/\/$/, "");
    const jsonUrl = `${cleanUrl}.json?limit=0&raw_json=1`;
    const res = await fetch(jsonUrl, {
      headers: { "User-Agent": "BCC-Media-Analytics/1.0", Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) return null;

    return {
      likes: post.ups ?? undefined,
      comments: post.num_comments ?? undefined,
      views: post.view_count ?? undefined,
      engagement: ((post.ups || 0) + (post.num_comments || 0)) || undefined,
      fetch_status: "ok",
      extra_note: `Reddit: ${post.ups} upvotes · ${post.num_comments} comments`,
    };
  } catch {
    return null;
  }
}

// ─── Instagram via RapidAPI ───────────────────────────────────────────────────
async function fetchInstagram(url: string): Promise<Partial<LinkMetrics> | null> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  const shortcodeMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = shortcodeMatch?.[1];

  if (!shortcode) {
    return { fetch_status: "partial", extra_note: "Could not parse Instagram URL. Use a direct post/reel link." };
  }

  if (!rapidApiKey) {
    return { fetch_status: "partial", extra_note: "RAPIDAPI_KEY not configured. Enter metrics manually." };
  }

  const HOST = "instagram-scraper-stable-api.p.rapidapi.com";
  const igHeaders = { "x-rapidapi-host": HOST, "x-rapidapi-key": rapidApiKey };

  // Detect type: reels use type=reel, posts use type=post
  const isReel = /\/reel\//.test(url);
  const type = isReel ? "reel" : "post";

  const parseIgMetrics = (json: Record<string, unknown>, source: string) => {
    const d = (json?.data ?? json?.media ?? json?.result ?? json) as Record<string, unknown>;
    // API returns 200 with {error: "...429..."} when Instagram rate-limits — treat as miss
    if (!d || d.error || (d.like_count == null && d.play_count == null && d.video_view_count == null)) return null;
    const likes = (d.like_count as number) ?? undefined;
    const comments = (d.comment_count as number) ?? undefined;
    const views = (d.play_count ?? d.video_view_count ?? d.view_count) as number | undefined;
    const shares = (d.share_count as number) ?? undefined;
    const owner = (d.owner as Record<string, unknown>)?.username || (d.user as Record<string, unknown>)?.username || "creator";
    return {
      views, likes, comments, shares,
      engagement: ((likes || 0) + (comments || 0) + (shares || 0)) || undefined,
      fetch_status: "ok" as const,
      extra_note: `Live data from Instagram (@${owner}) via ${source}`,
    };
  };

  // Method 1: get_media_data.php (Detailed Reel / Post Data)
  try {
    const res = await fetch(
      `https://${HOST}/get_media_data.php?reel_post_code_or_url=${encodeURIComponent(url)}&type=${type}`,
      { headers: igHeaders }
    );
    if (res.ok) {
      const json = await res.json();
      const parsed = parseIgMetrics(json, "get_media_data");
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  // Method 2: get_media_data_v2.php (Detailed Media Data v2) — uses shortcode directly
  try {
    const res = await fetch(
      `https://${HOST}/get_media_data_v2.php?media_code=${shortcode}`,
      { headers: igHeaders }
    );
    if (res.ok) {
      const json = await res.json();
      const parsed = parseIgMetrics(json, "get_media_data_v2");
      if (parsed) return parsed;
    }
  } catch { /* fall through */ }

  return {
    fetch_status: "partial",
    extra_note: "Instagram metrics unavailable — post may be private or API quota exceeded. Enter manually.",
  };
}

// ─── LinkedIn oEmbed ──────────────────────────────────────────────────────────
async function fetchLinkedIn(url: string): Promise<Partial<LinkMetrics> | null> {
  try {
    const oembedUrl = `https://www.linkedin.com/oembed?url=${encodeURIComponent(url)}`;
    const res = await fetch(oembedUrl, { headers: { "User-Agent": "BCC-Media-Analytics/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.title) return null;

    return {
      fetch_status: "partial",
      extra_note: `LinkedIn post confirmed ("${data.title?.slice(0, 60)}…"). LinkedIn's public API does not expose engagement metrics — enter manually from the post.`,
    };
  } catch {
    return null;
  }
}

// ─── Anthropic web_search fallback ────────────────────────────────────────────
// For platforms where direct fetch isn't enough, ask Claude to search for
// publicly available info about the post.
async function fetchWithAI(row: LinkInput): Promise<Partial<LinkMetrics> | null> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      tools: [{ type: "web_search_20250305" as "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: `Use web_search to find current, real engagement metrics for this social media post:

URL: ${row.live_link}
Platform: ${row.platform}
Creator/Page: ${row.handle_name}

Search for the post and find its REAL, LIVE stats. Look for:
- View count / play count
- Likes / reactions count
- Comment count
- Share count

RULES:
- Use web_search to fetch actual data
- Only report numbers you actually found in search results
- Do NOT guess or estimate
- If a metric isn't publicly available, use null

Respond with ONLY this JSON (no other text):
{"views": <number|null>, "likes": <number|null>, "comments": <number|null>, "shares": <number|null>, "fetch_status": "ok"|"partial"|"unavailable", "extra_note": "<what you found>"}`,
      }],
    });

    // Collect all text blocks (web_search tool responses come as text at end)
    let jsonStr = "";
    for (const block of response.content) {
      if (block.type === "text") jsonStr += block.text;
    }

    const jsonMatch = jsonStr.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      views: parsed.views ?? undefined,
      likes: parsed.likes ?? undefined,
      comments: parsed.comments ?? undefined,
      shares: parsed.shares ?? undefined,
      engagement: parsed.engagement ?? (((parsed.likes || 0) + (parsed.comments || 0) + (parsed.shares || 0)) || undefined),
      fetch_status: parsed.fetch_status || "partial",
      extra_note: parsed.extra_note,
    };
  } catch {
    return null;
  }
}

// ─── Platform detector ────────────────────────────────────────────────────────
function detectPlatform(url: string): string {
  if (/youtube\.com|youtu\.be/.test(url)) return "youtube";
  if (/reddit\.com/.test(url)) return "reddit";
  if (/instagram\.com/.test(url)) return "instagram";
  if (/linkedin\.com/.test(url)) return "linkedin";
  if (/twitter\.com|x\.com/.test(url)) return "twitter";
  return "other";
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { rows }: { rows: LinkInput[] } = await req.json();
    if (!rows?.length) return NextResponse.json({ error: "No rows" }, { status: 400 });

    const results: LinkMetrics[] = [];

    for (const row of rows) {
      const base = { handle_name: row.handle_name, platform: row.platform, live_link: row.live_link, fetched_at: new Date().toISOString() };

      if (!row.live_link?.startsWith("http")) {
        results.push({ ...base, fetch_status: "unavailable", extra_note: "No valid URL provided" });
        continue;
      }

      const urlPlatform = detectPlatform(row.live_link);

      let metrics: Partial<LinkMetrics> | null = null;

      // 1. Try direct platform-specific fetcher (most accurate)
      if (urlPlatform === "youtube") metrics = await fetchYouTube(row.live_link);
      else if (urlPlatform === "reddit") metrics = await fetchReddit(row.live_link);
      else if (urlPlatform === "instagram") metrics = await fetchInstagram(row.live_link);
      else if (urlPlatform === "linkedin") metrics = await fetchLinkedIn(row.live_link);

      // 2. If direct fetch got nothing or only partial, try AI search (for non-Instagram platforms)
      if (!metrics || (metrics.fetch_status === "partial" && urlPlatform !== "instagram" && urlPlatform !== "linkedin")) {
        const aiMetrics = await fetchWithAI(row);
        if (aiMetrics) {
          // Merge: prefer direct metrics where available, fill gaps with AI
          metrics = {
            ...aiMetrics,
            ...Object.fromEntries(Object.entries(metrics || {}).filter(([, v]) => v != null && v !== undefined)),
            extra_note: metrics?.extra_note || aiMetrics.extra_note,
          };
        }
      }

      if (!metrics) {
        results.push({ ...base, fetch_status: "unavailable", extra_note: "Could not retrieve metrics from this URL" });
      } else {
        results.push({ ...base, ...metrics, fetch_status: metrics.fetch_status ?? "partial" });
      }
    }

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
