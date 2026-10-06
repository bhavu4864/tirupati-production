import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authCookieName, deleteSession, getSessionIdentity } from "../../../lib/auth-session";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(authCookieName)?.value;
  const identity = await getSessionIdentity(token);
  await deleteSession(token, identity ?? undefined);
  const response = NextResponse.json({ success: true });
  response.cookies.set(authCookieName, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
