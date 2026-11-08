"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, SESSION_SECONDS, createSessionToken, passwordMatches } from "@/lib/admin";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  if (!process.env.ADMIN_PASSWORD) return "ADMIN_PASSWORD is not set on the server.";
  if (!passwordMatches(String(form.get("password") ?? ""))) return "Wrong password.";

  (await cookies()).set(ADMIN_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  redirect("/publish");
}

export async function logout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/alerts");
}
