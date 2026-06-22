import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

interface StoredToken {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

async function refreshAccessToken(stored: StoredToken): Promise<StoredToken | null> {
  if (!stored.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: stored.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!data.access_token) return null;

  // Merge: preserve existing refresh_token (Google doesn't re-send it on refresh)
  return {
    ...stored,
    access_token: data.access_token,
    expires_in: data.expires_in,
    expiry_date: Date.now() + (data.expires_in ?? 3600) * 1000,
    token_type: data.token_type ?? stored.token_type,
    scope: data.scope ?? stored.scope,
    // refresh_token is preserved from stored via spread above
  };
}

function isExpiredOrExpiringSoon(token: StoredToken): boolean {
  if (!token.expiry_date) {
    // No expiry stored — legacy token from before this fix. Treat as expired so
    // we attempt a refresh, which will compute and store a proper expiry_date.
    return true;
  }
  // Refresh 5 minutes early to avoid races
  return Date.now() > token.expiry_date - 5 * 60 * 1000;
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("google_calendar_token, google_calendar_email")
      .eq("id", user.id)
      .single();

    if (!profile?.google_calendar_token) {
      return NextResponse.json({ events: [], connected: false });
    }

    let token = profile.google_calendar_token as StoredToken;

    // Refresh the access token if it's expired or expiring soon
    if (isExpiredOrExpiringSoon(token)) {
      const refreshed = await refreshAccessToken(token);
      if (refreshed) {
        token = refreshed;
        // Persist the refreshed token so the next request doesn't refresh again
        await supabase
          .from("profiles")
          .update({ google_calendar_token: token })
          .eq("id", user.id);
      } else {
        // Refresh failed — the user needs to reconnect (e.g. token revoked)
        await supabase
          .from("profiles")
          .update({ google_calendar_token: null })
          .eq("id", user.id);
        return NextResponse.json({ events: [], connected: false, reconnect_required: true });
      }
    }

    // Fetch upcoming events (next 14 days for better coverage)
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    const eventsRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=30`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );

    // Detect expired/revoked token from Google's side
    if (eventsRes.status === 401) {
      // Try one more refresh before giving up
      const retried = await refreshAccessToken(token);
      if (retried) {
        token = retried;
        await supabase.from("profiles").update({ google_calendar_token: token }).eq("id", user.id);

        const retry = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=30`,
          { headers: { Authorization: `Bearer ${token.access_token}` } }
        );
        if (!retry.ok) {
          await supabase.from("profiles").update({ google_calendar_token: null }).eq("id", user.id);
          return NextResponse.json({ events: [], connected: false, reconnect_required: true });
        }
        const retryData = await retry.json();
        return buildResponse(supabase, user.id, retryData, timeMin, timeMax, profile.google_calendar_email);
      } else {
        await supabase.from("profiles").update({ google_calendar_token: null }).eq("id", user.id);
        return NextResponse.json({ events: [], connected: false, reconnect_required: true });
      }
    }

    if (!eventsRes.ok) {
      // Non-auth error (rate limit, etc.) — still connected, just return cached events
      const { data: cached } = await supabase
        .from("calendar_events")
        .select("*, verticals:vertical_id(id, name, color, icon)")
        .eq("user_id", user.id)
        .gte("start_time", timeMin)
        .order("start_time");
      return NextResponse.json({ events: cached || [], connected: true, email: profile.google_calendar_email, from_cache: true });
    }

    const eventsData = await eventsRes.json();
    return buildResponse(supabase, user.id, eventsData, timeMin, timeMax, profile.google_calendar_email);
  } catch (err) {
    console.error("calendar/events error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function buildResponse(supabase: any, userId: string, eventsData: any, timeMin: string, timeMax: string, email: string) {
  if (!eventsData.items) {
    const { data: cached } = await supabase
      .from("calendar_events")
      .select("*, verticals:vertical_id(id, name, color, icon)")
      .eq("user_id", userId)
      .gte("start_time", timeMin)
      .order("start_time");
    return NextResponse.json({ events: cached || [], connected: true, email });
  }

  const events = eventsData.items.map((e: Record<string, unknown>) => {
    const start = e.start as Record<string, string>;
    const end = e.end as Record<string, string>;
    const conferenceData = e.conferenceData as Record<string, unknown> | undefined;
    const entryPoints = conferenceData?.entryPoints as Array<Record<string, string>> | undefined;
    return {
      id: e.id as string,
      user_id: userId,
      summary: (e.summary as string) || "Untitled Meeting",
      description: (e.description as string) || null,
      start_time: start?.dateTime || start?.date,
      end_time: end?.dateTime || end?.date || null,
      location: (e.location as string) || null,
      meet_link: entryPoints?.find(ep => ep.entryPointType === "video")?.uri || null,
      attendees: e.attendees || null,
      synced_at: new Date().toISOString(),
    };
  });

  if (events.length) {
    await supabase.from("calendar_events").upsert(events, { onConflict: "id", ignoreDuplicates: false });
  }

  const { data: cached } = await supabase
    .from("calendar_events")
    .select("*, verticals:vertical_id(id, name, color, icon)")
    .eq("user_id", userId)
    .gte("start_time", timeMin)
    .lte("start_time", timeMax)
    .order("start_time");

  return NextResponse.json({ events: cached || [], connected: true, email });
}

export async function POST(req: Request) {
  try {
    const { eventId, verticalId } = await req.json();
    const supabase = await createServerSupabaseClient();
    await supabase.from("calendar_events").update({ vertical_id: verticalId || null }).eq("id", eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
