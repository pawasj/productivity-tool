import { createServerSupabaseClient } from "./supabase-server";

export async function getValidGoogleToken(): Promise<{ access_token: string; email: string } | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("google_calendar_token, google_calendar_email")
    .eq("id", user.id)
    .single();

  if (!profile?.google_calendar_token) return null;
  const token = profile.google_calendar_token as Record<string, unknown>;
  const email = profile.google_calendar_email as string;

  // Refresh if expired (with 60s buffer)
  const expiry = Number(token.expiry_date || 0);
  if (expiry - Date.now() < 60_000) {
    if (!token.refresh_token) return null;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: token.refresh_token as string,
        grant_type: "refresh_token",
      }),
    });
    const refreshed = await res.json();
    if (!refreshed.access_token) return null;

    const updated = {
      ...token,
      access_token: refreshed.access_token,
      expires_in: refreshed.expires_in,
      expiry_date: Date.now() + (refreshed.expires_in ?? 3600) * 1000,
    };
    await supabase.from("profiles").update({ google_calendar_token: updated }).eq("id", user.id);
    return { access_token: refreshed.access_token, email };
  }

  return { access_token: token.access_token as string, email };
}
