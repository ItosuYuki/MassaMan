import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { createSlackOAuthState, slackRedirectUri } from "@/lib/slack";

export async function GET(request: Request) {
  const session = await verifySession();
  if (session.role !== "user" && session.role !== "therapist") redirect("/");
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId) return Response.json({ error: "SLACK_CLIENT_ID is not configured" }, { status: 503 });

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "chat:write",
    user_scope: "users:read",
    redirect_uri: slackRedirectUri(request),
    state: await createSlackOAuthState(session.employeeId, session.role),
  });
  redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
}
