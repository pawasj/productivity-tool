import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase-server";
import type { OwnedMediaProperty, OwnedMediaPlatform } from "@/lib/types";

export const maxDuration = 120;

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
    const t = setTimeout(() => ctrl.abort(), 10000);
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

async function scanReddit(link: string): Promise<number | null> {
  // r/<sub> → about.json has exact subscriber count
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

async function scanYouTube(link: string): Promise<number | null> {
  const html = await fetchText(link);
  if (!html) return null;
  // Exact count in embedded JSON
  let m = html.match(/"subscriberCount"\s*:\s*"(\d+)"/);
  if (m) return parseInt(m[1]);
  // "1.23M subscribers" in subscriberCountText
  m = html.match(/([\d.,]+[KMB]?)\s*subscribers/i);
  if (m) return parseCount(m[1]);
  return null;
}

async function scanInstagram(link: string): Promise<number | null> {
  const html = await fetchText(link);
  if (!html) return null;
  // og:description: "12.5K Followers, 1,234 Following, 567 Posts"
  const m = html.match(/content="([\d.,]+[KMB]?)\s*Followers/i);
  if (m) return parseCount(m[1]);
  const m2 = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/);
  if (m2) return parseInt(m2[1]);
  return null;
}

async function scanLinkedIn(link: string): Promise<number | null> {
  const html = await fetchText(link);
  if (!html) return null;
  const m = html.match(/([\d.,]+[KMB]?)\s*followers/i);
  if (m) return parseCount(m[1]);
  return null;
}

async function scanSubstack(link: string): Promise<number | null> {
  const base = link.replace(/\/+$/, "");
  for (const url of [base + "/about", base]) {
    const html = await fetchText(url);
    if (!html) continue;
    const m = html.match(/([\d.,]+[KMB]?\+?)\s*subscribers/i);
    if (m) return parseCount(m[1].replace("+", ""));
  }
  return null;
}

const SCANNERS: Partial<Record<OwnedMediaPlatform, (link: string) => Promise<number | null>>> = {
  reddit: scanReddit,
  youtube: scanYouTube,
  instagram: scanInstagram,
  linkedin: scanLinkedIn,
  substack: scanSubstack,
};

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

    const scans = (Object.keys(SCANNERS) as OwnedMediaPlatform[])
      .filter(p => links[p])
      .map(async p => {
        const count = await SCANNERS[p]!(links[p]!);
        propResult[p] = count;
        if (count !== null && count > 0) updated[p] = count;
      });
    await Promise.all(scans);

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
