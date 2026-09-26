import "server-only";
import { headers } from "next/headers";
import { hmacSign, toBase64Url } from "@/lib/auth/crypto";
import { envPick } from "@/lib/env";

/**
 * Who is trying codes, for the attempt limit: a MAC of the client's IP
 * address, so the database never holds the address itself. Vercel sets
 * x-real-ip and x-forwarded-for itself, overwriting whatever the client
 * sent. A local server may send neither, and then every try shares one key.
 */
export async function unlockClientKey(): Promise<string> {
  const list = await headers();
  const ip =
    list.get("x-real-ip")?.trim() ||
    list.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const { AUTH_SECRET } = envPick("AUTH_SECRET");
  return toBase64Url(await hmacSign(AUTH_SECRET, "unlock-client", ip));
}
