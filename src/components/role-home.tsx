import { logout } from "@/app/actions/auth";

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
    <div className="min-h-dvh flex items-center justify-center bg-bg px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 flex flex-col gap-4">
        <span
          className={`self-start rounded-full px-3 py-1 text-xs font-medium ${ROLE_TINT_CLASSES[roleTint]}`}
        >
          {roleLabel}
        </span>

        <div>
          <h1 className="text-xl">ようこそ、{name} さん</h1>
          <p className="mt-1 text-sm text-ink-faint mono">社員番号: {employeeId}</p>
        </div>

        <p className="text-xs text-ink-faint leading-relaxed">{note}</p>

        <form action={logout}>
          <button
            type="submit"
            className="h-11 w-full rounded-xl border border-destructive text-destructive text-sm font-medium bg-surface"
          >
            ログアウト
          </button>
        </form>
      </div>
    </div>
  );
}
