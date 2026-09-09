import { requireRole } from "@/lib/dal";
import { RoleHome } from "@/components/role-home";

export default async function ScheduleHomePage() {
  const session = await requireRole("therapist");

  return (
    <RoleHome
      roleLabel="マッサージ師"
      roleTint="therapist"
      name={session.name}
      employeeId={session.employeeId}
      note="スケジュール画面（design/therapist-schedule-*.html）はこのタスクの対象外です。別Issueで実装予定です。"
    />
  );
}
