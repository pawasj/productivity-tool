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
  const headers = { "x-rapidapi-host": HOST, "x-rapidapi-key": rapidApiKey };
  const isReel = /\/reel\//.test(url);
  const type = isReel ? "reel" : "post";

  const attempts = [
    { name: "get_media_data_reel",   url: `https://${HOST}/get_media_data.php?reel_post_code_or_url=${encodeURIComponent(url)}&type=${type}` },
    { name: "get_media_data_v2",     url: `https://${HOST}/get_media_data_v2.php?media_code=${shortcode}` },
    { name: "get_reel_title",        url: `https://${HOST}/get_reel_title.php?reel_post_code_or_url=${encodeURIComponent(url)}&type=${type}` },
  ];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, { headers });
      const body = await res.text();
      debug[attempt.name] = { status: res.status, ok: res.ok, body: body.slice(0, 1200) };
      if (res.ok) {
        debug["WORKING_ENDPOINT"] = attempt.url;
        break;
      }
    } catch (e) {
      debug[attempt.name] = { error: String(e) };
    }
  }

  return NextResponse.json(debug, { status: 200 });
}
