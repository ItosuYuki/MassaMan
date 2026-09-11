import { AppSidebar } from "@/components/app-sidebar";

const ROLE_TINT_CLASSES = {
  user: "bg-role-user-soft text-role-user",
  therapist: "bg-role-therapist-soft text-role-therapist",
  admin: "bg-role-admin-soft text-role-admin",
} as const;

export function RoleHome({
  roleLabel,
  roleTint,
  name,
  employeeId,
  note,
}: {
  roleLabel: string;
  roleTint: keyof typeof ROLE_TINT_CLASSES;
  name: string;
  employeeId: string;
  note: string;
}) {
  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <AppSidebar role={roleTint} name={name} activePath={roleTint === "user" ? "/booking" : "/schedule"} />
      <main className="mx-auto flex w-full max-w-3xl grow flex-col gap-4 overflow-y-auto px-5 py-8 sm:px-8">
        <span className={`self-start rounded-full px-3 py-1 text-xs font-medium ${ROLE_TINT_CLASSES[roleTint]}`}>{roleLabel}</span>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h1 className="text-xl">ようこそ、{name} さん</h1>
          <p className="mt-1 text-sm text-ink-faint mono">社員番号: {employeeId}</p>
          <p className="mt-5 text-xs leading-relaxed text-ink-faint">{note}</p>
        </div>
      </main>
    </div>
  );
}
