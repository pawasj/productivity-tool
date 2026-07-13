import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import type { OwnedMediaProperty, OwnedMediaPlatform } from "@/lib/types";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// "12.5K" → 12500, "1.2M" → 1200000, "1,234" → 1234
function parseCount(raw: string): number | null {
  const s = raw.replace(/,/g, "").trim();
  const m = s.match(/^([\d.]+)\s*([KMB])?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const mult = m[2]?.toUpperCase() === "K" ? 1e3 : m[2]?.toUpperCase() === "M" ? 1e6 : m[2]?.toUpperCase() === "B" ? 1e9 : 1;
  return Math.round(n * mult);
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// Compact page representation for AI extraction: meta tags + title + visible text
function pageExcerpt(html: string): string {
  const metas = (html.match(/<meta[^>]+content="[^"]{3,300}"[^>]*>/gi) || []).slice(0, 40).join("\n");
  const title = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || "";
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 6000);
  return `TITLE: ${title}\nMETA TAGS:\n${metas}\nPAGE TEXT:\n${text}`.slice(0, 12000);
}

// ── Fast regex extractors (return count; html kept for AI fallback) ────────
function regexExtract(platform: OwnedMediaPlatform, html: string): number | null {
  let m: RegExpMatchArray | null;
  switch (platform) {
    case "youtube":
      m = html.match(/"subscriberCount"\s*:\s*"(\d+)"/);
      if (m) return parseInt(m[1]);
      m = html.match(/([\d.,]+[KMB]?)\s*subscribers/i);
      return m ? parseCount(m[1]) : null;
    case "instagram":
      m = html.match(/content="([\d.,]+[KMB]?)\s*Followers/i);
      if (m) return parseCount(m[1]);
      m = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
      return m ? parseInt(m[1]) : null;
    case "linkedin":
      m = html.match(/([\d.,]+[KMB]?)\s*followers/i);
      return m ? parseCount(m[1]) : null;
    case "substack":
      m = html.match(/([\d.,]+[KMB]?\+?)\s*subscribers/i);
      return m ? parseCount(m[1].replace("+", "")) : null;
    default:
      return null;
  }
}

async function scanRedditExact(link: string): Promise<number | null> {
  const m = link.match(/reddit\.com\/(r\/[^/?#]+)/i);
  if (!m) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`https://www.reddit.com/${m[1]}/about.json`, {
      headers: { "User-Agent": UA }, signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.subscribers ?? null;
  } catch { return null; }
}

// ── AI fallback: extract counts from fetched pages Claude-side ─────────────
async function aiExtract(pages: Array<{ platform: string; url: string; excerpt: string }>): Promise<Record<string, number>> {
  if (pages.length === 0) return {};
  try {
    const prompt = `You are extracting audience-size metrics from social media page content.

For each page below, find the follower / subscriber / member count of the profile the URL points to. Convert abbreviations (12.5K → 12500, 1.2M → 1200000). If the page content clearly does not contain the count (login wall, error page), return null for it.

Return ONLY a JSON object mapping platform to number or null, e.g. {"instagram": 45200, "linkedin": null}

${pages.map(p => `=== PLATFORM: ${p.platform} | URL: ${p.url} ===\n${p.excerpt}`).join("\n\n")}`;

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const raw = (msg.content[0] as { type: string; text: string }).text;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, number | null>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "number" && v > 0) out[k] = Math.round(v);
    }
    return out;
  } catch (e) {
    console.error("ai extract failed:", e);
    return {};
  }
}

const SCANNABLE: OwnedMediaPlatform[] = ["instagram", "linkedin", "youtube", "reddit", "substack"];

// POST /api/owned-media/scan — { id?: string } (single property, or all if omitted)
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({})) as { id?: string };

  const svc = createServiceRoleClient();
  let query = svc.from("owned_media_properties").select("*");
  if (id) query = query.eq("id", id);
  const { data: props, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: Record<string, Record<string, number | null>> = {};

  for (const prop of (props || []) as OwnedMediaProperty[]) {
    const links = prop.links || {};
    const updated: Record<string, number> = { ...(prop.metrics || {}) };
    const propResult: Record<string, number | null> = {};
    const aiQueue: Array<{ platform: string; url: string; excerpt: string }> = [];

    await Promise.all(SCANNABLE.filter(p => links[p]).map(async platform => {
      const url = links[platform]!;

      // Reddit: exact count via public JSON API
      if (platform === "reddit") {
        const count = await scanRedditExact(url);
        propResult[platform] = count;
        if (count) { updated[platform] = count; return; }
      }

      // Fetch the page once; regex first, AI fallback second
      const candidates = platform === "substack"
        ? [url.replace(/\/+$/, "") + "/about", url]
        : [url];
      for (const candidate of candidates) {
        const html = await fetchText(candidate);
        if (!html) continue;
        const count = regexExtract(platform, html);
        if (count && count > 0) {
          propResult[platform] = count;
          updated[platform] = count;
          return;
        }
        // Regex failed — queue the page content for AI extraction
        aiQueue.push({ platform, url: candidate, excerpt: pageExcerpt(html) });
        return;
      }
      propResult[platform] = propResult[platform] ?? null;
    }));

    // AI pass for everything the regexes couldn't read
    if (aiQueue.length > 0) {
      const aiCounts = await aiExtract(aiQueue);
      for (const [platform, count] of Object.entries(aiCounts)) {
        propResult[platform] = count;
        updated[platform] = count;
      }
      for (const q of aiQueue) {
        if (!(q.platform in aiCounts)) propResult[q.platform] = propResult[q.platform] ?? null;
      }
    }

    await svc.from("owned_media_properties").update({
      metrics: updated,
      metrics_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", prop.id);

    // Keep Distro Hub followers in sync
    for (const [platform, count] of Object.entries(updated)) {
      if (!count) continue;
      await svc.from("influencers")
        .update({ followers: count, updated_at: new Date().toISOString() })
        .eq("handle_name", prop.name)
        .eq("platform", platform)
        .eq("is_owned", true);
    }

    results[prop.id] = propResult;
  }

  return NextResponse.json({ ok: true, results });
}
