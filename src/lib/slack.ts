import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { slackConnections } from "@/db/schema";
import { db } from "@/lib/db";

const SLACK_API = "https://slack.com/api";

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function createSlackOAuthState(employeeId: string, role: "user" | "therapist") {
  return new SignJWT({ employeeId, role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(secretKey());
}

export async function verifySlackOAuthState(state: string) {
  const { payload } = await jwtVerify(state, secretKey(), { algorithms: ["HS256"] });
  if ((payload.role !== "user" && payload.role !== "therapist") || typeof payload.employeeId !== "string") return null;
  return { employeeId: payload.employeeId, role: payload.role };
}

export function slackRedirectUri(request: Request) {
  return process.env.SLACK_REDIRECT_URI ?? new URL("/api/slack/callback", request.url).toString();
}

export async function exchangeSlackCode(code: string, redirectUri: string) {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Slack OAuthの環境変数が設定されていません。");

  const response = await fetch(`${SLACK_API}/oauth.v2.access`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ code, redirect_uri: redirectUri }),
    cache: "no-store",
  });
  const result = await response.json() as {
    ok: boolean;
    error?: string;
    team?: { id?: string };
    authed_user?: { id?: string };
  };
  if (!response.ok || !result.ok || !result.team?.id || !result.authed_user?.id) {
    throw new Error(`Slack OAuthに失敗しました: ${result.error ?? response.status}`);
  }
  return { teamId: result.team.id, slackUserId: result.authed_user.id };
}

export async function saveSlackConnection(userId: string, teamId: string, slackUserId: string) {
  await db.insert(slackConnections).values({ userId, slackTeamId: teamId, slackUserId })
    .onConflictDoUpdate({ target: slackConnections.userId, set: { slackTeamId: teamId, slackUserId, connectedAt: new Date() } });
}

export async function disconnectSlack(userId: string) {
  await db.delete(slackConnections).where(eq(slackConnections.userId, userId));
}

export async function postSlackDm(slackUserId: string, text: string, blocks?: unknown[]) {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not set");
  const response = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ channel: slackUserId, text, ...(blocks ? { blocks } : {}) }),
    cache: "no-store",
  });
  const result = await response.json() as { ok: boolean; error?: string };
  if (!response.ok || !result.ok) throw new Error(`Slack DM送信に失敗しました: ${result.error ?? response.status}`);
}
