import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  const shortcodeMatch = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = shortcodeMatch?.[1];

  const debug: Record<string, unknown> = {
    url_received: url,
    shortcode_extracted: shortcode || null,
    rapidapi_key_set: !!rapidApiKey,
  };

  if (!rapidApiKey || !shortcode) {
    return NextResponse.json({ ...debug, error: !rapidApiKey ? "No key" : "No shortcode" });
  }

  const HOST = "instagram-scraper-stable-api.p.rapidapi.com";
  const headers = {
    "x-rapidapi-host": HOST,
    "x-rapidapi-key": rapidApiKey,
    "Content-Type": "application/json",
  };

  // Targeting the actual endpoint names seen on RapidAPI:
  // "Detailed Reel Data", "Detailed Post Data", "Detailed Media Data v2", "Get Media Code or ID"
  const attempts = [
    // Reel-specific paths
    { name: "GET_reel_shortcode_param",   method: "GET", url: `https://${HOST}/reel?shortcode=${shortcode}` },
    { name: "GET_reel_data",              method: "GET", url: `https://${HOST}/reel/data?shortcode=${shortcode}` },
    { name: "GET_reels_shortcode",        method: "GET", url: `https://${HOST}/reels/data?shortcode=${shortcode}` },
    // Post-specific paths
    { name: "GET_post_shortcode",         method: "GET", url: `https://${HOST}/post?shortcode=${shortcode}` },
    { name: "GET_post_data",              method: "GET", url: `https://${HOST}/post/data?shortcode=${shortcode}` },
    // Media paths (v1 and v2)
    { name: "GET_media_v1",              method: "GET", url: `https://${HOST}/media?shortcode=${shortcode}` },
    { name: "GET_media_v2",              method: "GET", url: `https://${HOST}/v2/media?shortcode=${shortcode}` },
    { name: "GET_v1_media",              method: "GET", url: `https://${HOST}/v1/media?shortcode=${shortcode}` },
    { name: "GET_v2_media_url",          method: "GET", url: `https://${HOST}/v2/media?url=${encodeURIComponent(url)}` },
    // "Get Media Code or ID" — likely a utility endpoint
    { name: "GET_media_code",            method: "GET", url: `https://${HOST}/media/code?url=${encodeURIComponent(url)}` },
    { name: "GET_media_id",              method: "GET", url: `https://${HOST}/media/id?shortcode=${shortcode}` },
    // Detailed variants
    { name: "GET_detailed_post",         method: "GET", url: `https://${HOST}/detailed-post?shortcode=${shortcode}` },
    { name: "GET_detailed_reel",         method: "GET", url: `https://${HOST}/detailed-reel?shortcode=${shortcode}` },
    { name: "GET_detailed_media",        method: "GET", url: `https://${HOST}/detailed-media?shortcode=${shortcode}` },
    // URL-based variants
    { name: "GET_post_url",              method: "GET", url: `https://${HOST}/post?url=${encodeURIComponent(url)}` },
    { name: "GET_reel_url",              method: "GET", url: `https://${HOST}/reel?url=${encodeURIComponent(url)}` },
    { name: "GET_media_url",             method: "GET", url: `https://${HOST}/media?url=${encodeURIComponent(url)}` },
    // code_or_id param style (used by scraper-api2)
    { name: "GET_code_or_id",           method: "GET", url: `https://${HOST}/post_info?code_or_id_or_url=${shortcode}` },
    { name: "GET_v1_post_info_code",    method: "GET", url: `https://${HOST}/v1/post_info?code_or_id_or_url=${shortcode}` },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method,
        headers,
        ...(attempt.body ? { body: (attempt as {body?: string}).body } : {}),
      });
      const body = await res.text();
      debug[attempt.name] = {
        status: res.status,
        ok: res.ok,
        body: body.slice(0, 800),
      };
      if (res.ok) {
        debug["WORKING_ENDPOINT"] = attempt.url;
        debug["WORKING_METHOD"] = attempt.method;
        break;
      }
    } catch (e) {
      debug[attempt.name] = { error: String(e) };
    }
  }

  return NextResponse.json(debug, { status: 200 });
}
