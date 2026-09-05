import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { LINE_STATE_COOKIE } from "@/lib/line-login";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type LineProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

function redirectToDashboard(request: Request, error?: string) {
  const url = new URL("/dashboard", request.url);
  if (error) url.searchParams.set("line_error", error);
  return NextResponse.redirect(url);
}

function isLineProfile(value: unknown): value is LineProfile {
  if (typeof value !== "object" || value === null) return false;

  const profile = value as Record<string, unknown>;
  return typeof profile.userId === "string" && typeof profile.displayName === "string";
}

async function readJson(response: Response) {
  return response.json().catch(() => null) as Promise<unknown>;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = cookieStore.get(LINE_STATE_COOKIE)?.value;
  cookieStore.delete(LINE_STATE_COOKIE);

  if (!code || !state || !storedState || state !== storedState) {
    return redirectToDashboard(request, "invalid_state");
  }

  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  const channelSecret = process.env.LINE_LOGIN_CHANNEL_SECRET;
  if (!channelId || !channelSecret) {
    return redirectToDashboard(request, "not_configured");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    const redirectUri = new URL("/auth/line/callback", request.url).toString();
    const tokenResponse = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: channelId,
        client_secret: channelSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      }).toString(),
      cache: "no-store"
    });
    const tokenBody = await readJson(tokenResponse);
    const accessToken =
      typeof tokenBody === "object" && tokenBody !== null && "access_token" in tokenBody
        ? (tokenBody as { access_token?: unknown }).access_token
        : null;

    if (!tokenResponse.ok || typeof accessToken !== "string" || !accessToken) {
      throw new Error("LINE token exchange failed");
    }

    const profileResponse = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store"
    });
    const profileBody = await readJson(profileResponse);

    if (!profileResponse.ok || !isLineProfile(profileBody)) {
      throw new Error("LINE profile lookup failed");
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({
        line_user_id: profileBody.userId,
        display_name: profileBody.displayName,
        avatar_url: profileBody.pictureUrl ?? null
      })
      .eq("id", user.id);

    if (updateError) {
      if (updateError.code === "23505") {
        return redirectToDashboard(request, "already_linked");
      }
      throw updateError;
    }

    const dashboardUrl = new URL("/dashboard", request.url);
    dashboardUrl.searchParams.set("line", "connected");
    return NextResponse.redirect(dashboardUrl);
  } catch (error) {
    console.error("LINE Login callback failed", error instanceof Error ? error.message : error);
    return redirectToDashboard(request, "oauth_failed");
  }
}
