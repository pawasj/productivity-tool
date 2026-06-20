import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;

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
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) throw new Error("No access token received");

    // Get calendar email
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v1/userinfo?alt=json", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const googleProfile = await profileRes.json();

    // Store in Supabase profile
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    await supabase.from("profiles").update({
      google_calendar_token: tokens,
      google_calendar_email: googleProfile.email,
    }).eq("id", user.id);

    return NextResponse.redirect(`${baseUrl}/dashboard/profile?cal_connected=1`);
  } catch (err) {
    console.error("Google Calendar callback error:", err);
    const baseUrl2 = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
    return NextResponse.redirect(`${baseUrl2}/dashboard/profile?cal_error=token_failed`);
  }
}
