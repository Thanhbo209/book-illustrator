import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { apiError } from "@/lib/api/errors";
import { prisma } from "@/lib/storage/db";
import { loginSchema } from "@/lib/validation/identity";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { name, email } = parsed.data;

  // Email is the identity key: existing email loads that user as-is (name
  // is not overwritten), new email creates one with the submitted name.
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    try {
      user = await prisma.user.create({ data: { name, email } });
    } catch {
      // Two concurrent logins for a brand-new email can both miss the
      // lookup above; the loser of the unique-constraint race just loads
      // the winner's row instead of failing.
      user = await prisma.user.findUnique({ where: { email } });
      if (!user) return apiError(500, "Could not create or load user");
    }
  }

  await createSession(user.id);

  return NextResponse.json({ id: user.id, name: user.name, email: user.email });
}
