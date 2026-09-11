import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import type { Role } from "@/lib/session";

export type Employee = {
  id: string;
  employeeId: string;
  name: string;
  role: Role;
  passwordHash: string;
};

export async function findEmployeeByCode(employeeId: string): Promise<Employee | null> {
  const rows = await db
    .select({
      id: users.id,
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
    id: row.id,
    employeeId: row.employeeCode,
    name: row.name,
    role: row.role,
    passwordHash: row.passwordHash,
  };
}
