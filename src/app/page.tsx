import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { homePathForRole } from "@/lib/dal";

export default async function Home() {
  const session = await getSession();
  redirect(session ? homePathForRole(session.role) : "/login");
}
