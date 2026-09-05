import { NextResponse } from "next/server";

import { LINE_STATE_COOKIE } from "@/lib/line-login";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const STATE_MAX_AGE_SECONDS = 10 * 60;

function redirectToDashboard(request: Request, error?: string) {
  const url = new URL("/dashboard", request.url);
  if (error) url.searchParams.set("line_error", error);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) {
    return redirectToDashboard(request, "not_configured");
  }

  const state = crypto.randomUUID();
  const redirectUri = new URL("/auth/line/callback", request.url).toString();
  const authorizeUrl = new URL("https://access.line.me/oauth2/v2.1/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", channelId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", "profile openid");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(LINE_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: STATE_MAX_AGE_SECONDS,
    path: "/auth/line",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
