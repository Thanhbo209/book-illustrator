import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCookieStore } from "@/tests/mocks/next-headers";

vi.mock("next/headers", () => import("@/tests/mocks/next-headers"));

import { clearSession, createSession, getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/storage/db";

describe("session", () => {
  const emails: string[] = [];

  beforeEach(() => {
    resetCookieStore();
  });

  afterEach(async () => {
    while (emails.length) {
      const email = emails.pop()!;
      await prisma.user.deleteMany({ where: { email } });
    }
  });

  async function createTestUser() {
    const email = `session-${crypto.randomUUID()}@test.dev`;
    emails.push(email);
    return prisma.user.create({ data: { name: "Test User", email } });
  }

  it("returns null when no session cookie is set", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("resolves the signed-in user after createSession", async () => {
    const user = await createTestUser();

    await createSession(user.id);
    const current = await getCurrentUser();

    expect(current).toEqual({ id: user.id, name: user.name, email: user.email });
  });

  it("returns null after clearSession", async () => {
    const user = await createTestUser();
    await createSession(user.id);

    await clearSession();

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("rejects a tampered session cookie", async () => {
    const user = await createTestUser();
    await createSession(user.id);

    // Swap in another user id but keep the original (now-invalid) signature.
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const original = store.get("session")?.value ?? "";
    const signature = original.slice(original.lastIndexOf("."));
    store.set("session", `not-the-real-user-id${signature}`);

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
