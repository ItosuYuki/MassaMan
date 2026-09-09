import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { homePathForRole } from "@/lib/dal";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(homePathForRole(session.role));
  }

  return <LoginForm />;
}
