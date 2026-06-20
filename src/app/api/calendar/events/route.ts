import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

async function refreshToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  return res.json();
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("google_calendar_token, google_calendar_email").eq("id", user.id).single();
    if (!profile?.google_calendar_token) return NextResponse.json({ events: [], connected: false });

    let token = profile.google_calendar_token as Record<string, string>;

    // Check if token is expired and refresh
    const expiryDate = token.expiry_date ? parseInt(token.expiry_date) : 0;
    if (expiryDate && Date.now() > expiryDate - 60000) {
      if (token.refresh_token) {
        const newToken = await refreshToken(token.refresh_token);
        if (newToken.access_token) {
          token = { ...token, ...newToken };
          await supabase.from("profiles").update({ google_calendar_token: token }).eq("id", user.id);
        }
      }
    }

    // Fetch events for next 7 days
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const eventsRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=20`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );
    const eventsData = await eventsRes.json();

    if (!eventsData.items) return NextResponse.json({ events: [], connected: true });

    // Upsert events into our cache table
    const events = eventsData.items.map((e: Record<string, unknown>) => {
      const start = e.start as Record<string, string>;
      const end = e.end as Record<string, string>;
      const conferenceData = e.conferenceData as Record<string, unknown> | undefined;
      const entryPoints = conferenceData?.entryPoints as Array<Record<string, string>> | undefined;
      return {
        id: e.id as string,
        user_id: user.id,
        summary: (e.summary as string) || "Untitled Meeting",
        description: e.description as string || null,
        start_time: start?.dateTime || start?.date,
        end_time: end?.dateTime || end?.date || null,
        location: e.location as string || null,
        meet_link: entryPoints?.find(ep => ep.entryPointType === "video")?.uri || null,
        attendees: e.attendees || null,
        synced_at: new Date().toISOString(),
      };
    });

    // Upsert into cache (preserve vertical_id)
    if (events.length) {
      await supabase.from("calendar_events").upsert(events, { onConflict: "id", ignoreDuplicates: false });
    }

    // Return from cache (so vertical_id assignments are preserved)
    const { data: cached } = await supabase
      .from("calendar_events")
      .select("*, verticals:vertical_id(id, name, color, icon)")
      .eq("user_id", user.id)
      .gte("start_time", timeMin)
      .lte("start_time", timeMax)
      .order("start_time");

    return NextResponse.json({ events: cached || [], connected: true, email: profile.google_calendar_email });
  } catch (err) {
    console.error("calendar/events error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Assign vertical to a calendar event
  try {
    const { eventId, verticalId } = await req.json();
    const supabase = await createServerSupabaseClient();
    await supabase.from("calendar_events").update({ vertical_id: verticalId || null }).eq("id", eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
