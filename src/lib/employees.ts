import "server-only";
import { db } from "@/lib/db";
import type { Role } from "@/lib/session";

export type Employee = {
  employeeId: string;
  name: string;
  role: Role;
  passwordHash: string;
};

type UserRow = {
  employee_code: string;
  name: string;
  role: string;
  password_hash: string;
};

const FIND_BY_CODE = db.prepare(
  "SELECT employee_code, name, role, password_hash FROM users WHERE employee_code = ? AND is_active = 1"
);

export function findEmployeeByCode(employeeId: string): Employee | null {
  const row = FIND_BY_CODE.get(employeeId) as UserRow | undefined;
  if (!row) return null;

  return {
    employeeId: row.employee_code,
    name: row.name,
    role: row.role as Role,
    passwordHash: row.password_hash,
  };
}
