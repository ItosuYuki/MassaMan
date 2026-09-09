import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSession, type Role, type SessionPayload } from "@/lib/session";

export const HOME_PATH_BY_ROLE: Record<Role, string> = {
  user: "/booking",
  therapist: "/schedule",
  admin: "/dashboard",
};

export function homePathForRole(role: Role): string {
  return HOME_PATH_BY_ROLE[role];
}

/** Verifies the session for the current request. Redirects to /login if absent/invalid. */
export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
});

/**
 * Verifies the session AND that it belongs to the given role. A logged-in user of
 * the wrong role is sent to their own home rather than /login, since they are
 * authenticated — just not authorized for this route.
 */
export async function requireRole(role: Role): Promise<SessionPayload> {
  const session = await verifySession();
  if (session.role !== role) {
    redirect(homePathForRole(session.role));
  }
  return session;
}
