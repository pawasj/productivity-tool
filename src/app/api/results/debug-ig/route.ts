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

  if (!rapidApiKey) {
    return NextResponse.json({ ...debug, error: "RAPIDAPI_KEY env var not set" });
  }

  if (!shortcode) {
    return NextResponse.json({ ...debug, error: "Could not extract shortcode from URL" });
  }

  // Test API 1: instagram-scraper-api2
  try {
    const res1 = await fetch(
      `https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url=${shortcode}`,
      {
        headers: {
          "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
        },
      }
    );
    const body1 = await res1.text();
    debug["api1_instagram_scraper_api2"] = {
      status: res1.status,
      ok: res1.ok,
      body: body1.slice(0, 2000),
    };
  } catch (e) {
    debug["api1_instagram_scraper_api2"] = { error: String(e) };
  }

  // Test API 2: instagram230
  try {
    const res2 = await fetch(
      `https://instagram230.p.rapidapi.com/post/details?shortcode=${shortcode}`,
      {
        headers: {
          "x-rapidapi-host": "instagram230.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
        },
      }
    );
    const body2 = await res2.text();
    debug["api2_instagram230"] = {
      status: res2.status,
      ok: res2.ok,
      body: body2.slice(0, 2000),
    };
  } catch (e) {
    debug["api2_instagram230"] = { error: String(e) };
  }

  // Test API 3: instagram-bulk-profile-scrapper
  try {
    const res3 = await fetch(
      `https://instagram-bulk-profile-scrapper.p.rapidapi.com/ig/post_info/?shortcode=${shortcode}`,
      {
        headers: {
          "x-rapidapi-host": "instagram-bulk-profile-scrapper.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
        },
      }
    );
    const body3 = await res3.text();
    debug["api3_bulk_scrapper"] = {
      status: res3.status,
      ok: res3.ok,
      body: body3.slice(0, 2000),
    };
  } catch (e) {
    debug["api3_bulk_scrapper"] = { error: String(e) };
  }

  // Test API 4: rocketapi-for-instagram
  try {
    const res4 = await fetch(
      "https://rocketapi-for-instagram.p.rapidapi.com/instagram/media/get_info",
      {
        method: "POST",
        headers: {
          "x-rapidapi-host": "rocketapi-for-instagram.p.rapidapi.com",
          "x-rapidapi-key": rapidApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: shortcode }),
      }
    );
    const body4 = await res4.text();
    debug["api4_rocketapi"] = {
      status: res4.status,
      ok: res4.ok,
      body: body4.slice(0, 2000),
    };
  } catch (e) {
    debug["api4_rocketapi"] = { error: String(e) };
  }

  return NextResponse.json(debug, { status: 200 });
}
