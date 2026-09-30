import { cookies } from "next/headers";
import type { IssuedSession } from "./party-access";

const isProduction = () => process.env.NODE_ENV === "production";

export const sessionCookieName = () => (isProduction() ? "__Secure-pp_session" : "pp_session");

export const partyPath = (partyId: string) => `/p/${partyId}`;

export async function storeSession(session: IssuedSession): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), session.sessionToken, {
    path: partyPath(session.partyId),
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict",
    expires: session.expiresAt,
  });
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(sessionCookieName())?.value;
}
