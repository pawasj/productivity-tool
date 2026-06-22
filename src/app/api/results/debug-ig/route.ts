import { NextRequest, NextResponse } from "next/server";

// Temporary debug endpoint — remove after confirming Instagram API works
// Usage: GET /api/results/debug-ig?url=https://www.instagram.com/reel/SHORTCODE/
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  const shortcodeMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = shortcodeMatch?.[1];

  const debug: Record<string, unknown> = {
    url_received: url,
    shortcode_extracted: shortcode || null,
    rapidapi_key_set: !!rapidApiKey,
    rapidapi_key_prefix: rapidApiKey ? rapidApiKey.slice(0, 8) + "..." : null,
  };

  if (!rapidApiKey || !shortcode) {
    return NextResponse.json({ ...debug, error: !rapidApiKey ? "No key" : "No shortcode" });
  }

  const HOST = "instagram-scraper-stable-api.p.rapidapi.com";
  const headers = {
    "x-rapidapi-host": HOST,
    "x-rapidapi-key": rapidApiKey,
  };

  // Try every common endpoint pattern this API might expose
  const attempts = [
    { name: "get_post_by_shortcode",  method: "GET",  url: `https://${HOST}/v1/post_info?shortcode=${shortcode}` },
    { name: "get_post_by_url",        method: "GET",  url: `https://${HOST}/v1/post_info?url=${encodeURIComponent(url)}` },
    { name: "media_info_shortcode",   method: "GET",  url: `https://${HOST}/media/info?shortcode=${shortcode}` },
    { name: "media_by_url",           method: "GET",  url: `https://${HOST}/media?url=${encodeURIComponent(url)}` },
    { name: "reel_by_shortcode",      method: "GET",  url: `https://${HOST}/reel?shortcode=${shortcode}` },
    { name: "post_by_shortcode",      method: "GET",  url: `https://${HOST}/post?shortcode=${shortcode}` },
    { name: "post_by_url_param",      method: "GET",  url: `https://${HOST}/post?url=${encodeURIComponent(url)}` },
    { name: "get_media",              method: "GET",  url: `https://${HOST}/get_media?shortcode=${shortcode}` },
    { name: "v2_post_info",           method: "GET",  url: `https://${HOST}/v2/post_info?shortcode=${shortcode}` },
    { name: "scrape_post",            method: "GET",  url: `https://${HOST}/scrape?url=${encodeURIComponent(url)}` },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, { method: attempt.method, headers });
      const body = await res.text();
      debug[attempt.name] = {
        status: res.status,
        ok: res.ok,
        url: attempt.url,
        body: body.slice(0, 1500),
      };
      // Stop at first success so we can clearly see the working endpoint + shape
      if (res.ok) break;
    } catch (e) {
      debug[attempt.name] = { error: String(e) };
    }
  }

  return NextResponse.json(debug, { status: 200 });
}
