"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { createSession, deleteSession } from "@/lib/session";
import { findEmployeeByCode } from "@/lib/employees";
import { homePathForRole } from "@/lib/dal";

export type LoginFormState = {
  error?: string;
} | undefined;

export async function login(
  _prevState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!employeeId || !password) {
    return { error: "社員番号とパスワードを入力してください。" };
  }

  const employee = await findEmployeeByCode(employeeId);
  const passwordMatches = employee
    ? await bcrypt.compare(password, employee.passwordHash)
    : false;

  if (!employee || !passwordMatches) {
    return { error: "社員番号またはパスワードが正しくありません。" };
  }

  await createSession({
    employeeId: employee.employeeId,
    name: employee.name,
    role: employee.role,
  });

  redirect(homePathForRole(employee.role));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
