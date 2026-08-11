import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/storage/db";
import type { User } from "@/types/domain";

const COOKIE_NAME = "session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured");
  }
  return secret;
}

function sign(userId: string): string {
  return createHmac("sha256", getSecret()).update(userId).digest("hex");
}

/** cuids never contain ".", so the last "." unambiguously separates id from signature. */
function parseCookieValue(value: string | undefined): string | null {
  if (!value) return null;
  const separatorIndex = value.lastIndexOf(".");
  if (separatorIndex === -1) return null;

  const userId = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);
  const expected = sign(userId);

  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (provided.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(provided, expectedBuf)) return null;

  return userId;
}

export async function createSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, `${userId}.${sign(userId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const userId = parseCookieValue(store.get(COOKIE_NAME)?.value);
  if (!userId) return null;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  return { id: user.id, name: user.name, email: user.email };
}
