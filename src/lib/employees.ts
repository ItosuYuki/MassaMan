import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import type { Role } from "@/lib/session";

export type Employee = {
  employeeId: string;
  name: string;
  role: Role;
  passwordHash: string;
};

export async function findEmployeeByCode(employeeId: string): Promise<Employee | null> {
  const rows = await db
    .select({
      employeeCode: users.employeeCode,
      name: users.name,
      role: users.role,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(and(eq(users.employeeCode, employeeId), eq(users.isActive, true)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    employeeId: row.employeeCode,
    name: row.name,
    role: row.role,
    passwordHash: row.passwordHash,
  };
}

const FIND_THERAPIST_PROFILE_ID_BY_CODE = db.prepare(`
  SELECT tp.id
  FROM therapist_profiles tp
  JOIN users u ON u.id = tp.user_id
  WHERE u.employee_code = ?
`);

export function findTherapistProfileIdByEmployeeCode(employeeId: string): string | null {
  const row = FIND_THERAPIST_PROFILE_ID_BY_CODE.get(employeeId) as { id: string } | undefined;
  return row?.id ?? null;
}
