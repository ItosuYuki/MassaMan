"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { rooms, therapistProfiles, users } from "@/db/schema";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/dal";

export type TherapistFormState = { error?: string } | undefined;

const VALID_GENDERS = new Set(["male", "female", "unspecified"]);
const VALID_AGE_BRACKETS = new Set(["20s", "30s", "40s", "50s_plus"]);

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createTherapist(
  _previousState: TherapistFormState,
  formData: FormData
): Promise<TherapistFormState> {
  await requireRole("admin");

  const employeeCode = textValue(formData, "employeeCode");
  const name = textValue(formData, "name");
  const password = textValue(formData, "password");
  const gender = textValue(formData, "gender");
  const ageBracket = textValue(formData, "ageBracket");
  const roomId = textValue(formData, "roomId");
  const specialties = textValue(formData, "specialties")
    .split(/[、,]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const bio = textValue(formData, "bio") || null;

  if (!employeeCode || !name || !password) {
    return { error: "社員番号・氏名・初期パスワードを入力してください。" };
  }
  if (employeeCode.length > 50 || name.length > 100) {
    return { error: "社員番号または氏名が長すぎます。" };
  }
  if (password.length < 8) {
    return { error: "初期パスワードは8文字以上で入力してください。" };
  }
  if (!VALID_GENDERS.has(gender) || !VALID_AGE_BRACKETS.has(ageBracket)) {
    return { error: "性別と年代を正しく選択してください。" };
  }

  if (roomId) {
    const room = await db.select({ id: rooms.id }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
    if (room.length === 0) return { error: "担当する部屋を正しく選択してください。" };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.employeeCode, employeeCode))
    .limit(1);
  if (existing.length > 0) {
    return { error: "その社員番号はすでに登録されています。" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        employeeCode,
        name,
        role: "therapist",
        gender: gender as "male" | "female" | "unspecified",
        ageBracket: ageBracket as "20s" | "30s" | "40s" | "50s_plus",
        passwordHash,
      })
      .returning({ id: users.id });

    await tx.insert(therapistProfiles).values({
      userId: user.id,
      specialties: specialties.length > 0 ? specialties : null,
      bio,
      roomId: roomId || null,
    });
  });

  revalidatePath("/therapists");
  redirect("/therapists");
}
