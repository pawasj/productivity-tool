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

  // Try every plausible path + method combination including POST bodies
  const attempts = [
    { name: "GET_root",              method: "GET",  url: `https://${HOST}/` },
    { name: "GET_fetch",             method: "GET",  url: `https://${HOST}/fetch?url=${encodeURIComponent(url)}` },
    { name: "GET_info",              method: "GET",  url: `https://${HOST}/info?url=${encodeURIComponent(url)}` },
    { name: "GET_reel_info",         method: "GET",  url: `https://${HOST}/reel/info?shortcode=${shortcode}` },
    { name: "GET_reels",             method: "GET",  url: `https://${HOST}/reels?shortcode=${shortcode}` },
    { name: "GET_instagram",         method: "GET",  url: `https://${HOST}/instagram?url=${encodeURIComponent(url)}` },
    { name: "GET_media_details",     method: "GET",  url: `https://${HOST}/media-details?shortcode=${shortcode}` },
    { name: "GET_shortcode",         method: "GET",  url: `https://${HOST}/${shortcode}` },
    { name: "POST_url_body",         method: "POST", url: `https://${HOST}/`, body: JSON.stringify({ url }) },
    { name: "POST_scrape",           method: "POST", url: `https://${HOST}/scrape`, body: JSON.stringify({ url }) },
    { name: "POST_fetch",            method: "POST", url: `https://${HOST}/fetch`, body: JSON.stringify({ url, shortcode }) },
    { name: "POST_media",            method: "POST", url: `https://${HOST}/media`, body: JSON.stringify({ shortcode }) },
    { name: "GET_no_host_override",  method: "GET",  url: `https://${HOST}/post_info?shortcode=${shortcode}` },
    { name: "GET_reel_shortcode",    method: "GET",  url: `https://${HOST}/reel_info?shortcode=${shortcode}` },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method,
        headers,
        ...(attempt.body ? { body: attempt.body } : {}),
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
