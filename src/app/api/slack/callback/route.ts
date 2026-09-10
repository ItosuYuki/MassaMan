import { redirect } from "next/navigation";
import { getNotificationUserId } from "@/lib/notification-settings";
import { exchangeSlackCode, saveSlackConnection, slackRedirectUri, verifySlackOAuthState } from "@/lib/slack";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return Response.json({ error: "Slack OAuthのパラメータが不足しています" }, { status: 400 });

  const oauthState = await verifySlackOAuthState(state);
  if (!oauthState) return Response.json({ error: "無効なSlack OAuth stateです" }, { status: 400 });
  try {
    const connection = await exchangeSlackCode(code, slackRedirectUri(request));
    const userId = await getNotificationUserId(oauthState.employeeId);
    await saveSlackConnection(userId, connection.teamId, connection.slackUserId);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Slack連携に失敗しました" }, { status: 500 });
  }
  redirect(oauthState.role === "user" ? "/booking?slack=connected" : "/schedule?slack=connected");
}
