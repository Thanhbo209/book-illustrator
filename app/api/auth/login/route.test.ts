// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCookieStore } from "@/tests/mocks/next-headers";

vi.mock("next/headers", () => import("@/tests/mocks/next-headers"));

import { POST } from "@/app/api/auth/login/route";
import { prisma } from "@/lib/storage/db";

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
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

  it("creates a new user for an unseen email", async () => {
    const email = `login-${crypto.randomUUID()}@test.dev`;
    emails.push(email);

    const response = await POST(loginRequest({ name: "Ada Lovelace", email }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ name: "Ada Lovelace", email });

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).not.toBeNull();
  });

  it("loads the existing user without overwriting the stored name", async () => {
    const email = `login-${crypto.randomUUID()}@test.dev`;
    emails.push(email);
    const existing = await prisma.user.create({ data: { name: "Original Name", email } });

    const response = await POST(loginRequest({ name: "Different Name", email }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe(existing.id);
    expect(body.name).toBe("Original Name");
  });

  it("rejects invalid input before touching the database", async () => {
    const response = await POST(loginRequest({ name: "", email: "not-an-email" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toBeTruthy();
  });
});
