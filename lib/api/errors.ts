import { NextResponse } from "next/server";
import type { ApiErrorBody } from "@/types/api";

export function apiError(status: number, message: string, code?: string) {
  const body: ApiErrorBody = { error: { message, code } };
  return NextResponse.json(body, { status });
}

export class AuthError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
