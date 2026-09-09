import { requireRole } from "@/lib/dal";
import { RoleHome } from "@/components/role-home";

export default async function DashboardHomePage() {
  const session = await requireRole("admin");

  return (
    <RoleHome
      roleLabel="管理者"
      roleTint="admin"
      name={session.name}
      employeeId={session.employeeId}
      note="管理ダッシュボード（design/admin-dashboard-*.html）はこのタスクの対象外です。別Issueで実装予定です。"
    />
  );
}
