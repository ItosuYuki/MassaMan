import { requireRole } from "@/lib/dal";
import { RoleHome } from "@/components/role-home";

export default async function BookingHomePage() {
  const session = await requireRole("user");

  return (
    <RoleHome
      roleLabel="利用者"
      roleTint="user"
      name={session.name}
      employeeId={session.employeeId}
      note="予約画面（design/user-booking-*.html）はこのタスクの対象外です。別Issueで実装予定です。"
    />
  );
}
