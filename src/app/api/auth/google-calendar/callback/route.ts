import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  // Must match the redirect_uri used in the authorize request exactly
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bombaycontentcompany.com";

  if (error || !code) {
    return NextResponse.redirect(`${baseUrl}/dashboard/profile?cal_error=access_denied`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = `${baseUrl}/api/auth/google-calendar/callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error("No access token received");

    // Compute and store expiry_date as a Unix ms timestamp so we can reliably
    // detect when the access token expires (Google returns expires_in in seconds)
    const tokenToStore = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token, // only present on first auth or after consent
      expires_in: tokens.expires_in,
      token_type: tokens.token_type,
      scope: tokens.scope,
      expiry_date: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    };

    // Get Google account email
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleProfile = await profileRes.json();

    // Store in Supabase profile
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // If there's an existing token with a refresh_token and this new token doesn't
    // have one (Google only sends it on first connect), preserve the old one
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("google_calendar_token")
      .eq("id", user.id)
      .single();

    const existing = existingProfile?.google_calendar_token as Record<string, unknown> | null;
    if (!tokenToStore.refresh_token && existing?.refresh_token) {
      tokenToStore.refresh_token = existing.refresh_token as string;
    }

    await supabase.from("profiles").update({
      google_calendar_token: tokenToStore,
      google_calendar_email: googleProfile.email,
    }).eq("id", user.id);

    return NextResponse.redirect(`${baseUrl}/dashboard/profile?cal_connected=1`);
  } catch (err) {
    console.error("Google Calendar callback error:", err);
    return NextResponse.redirect(`${baseUrl}/dashboard/profile?cal_error=token_failed`);
  }
}
