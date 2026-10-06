import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionUser } from "../../../lib/auth-session";

export async function GET() {
  const cookieStore = await cookies();
  const user = await getSessionUser(cookieStore.get(authCookieName)?.value);
  return NextResponse.json(
    { user },
    { headers: { "Cache-Control": "no-store" } },
  );
}
