import { NextResponse } from "next/server";
import { authenticateUser } from "../../../lib/auth-users";
import { authCookieName, createSession } from "../../../lib/auth-session";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter a valid login request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Enter a username and password." }, { status: 400 });
  }

  const credentials = body as {
    username?: unknown;
    password?: unknown;
    remember?: unknown;
  };
  if (
    typeof credentials.username !== "string" ||
    typeof credentials.password !== "string" ||
    !credentials.username.trim() ||
    !credentials.password ||
    credentials.username.length > 254 ||
    Buffer.byteLength(credentials.password, "utf8") > 1024
  ) {
    return NextResponse.json(
      { error: "Enter a valid username and password." },
      { status: 400 },
    );
  }

  const authenticated = await authenticateUser(
    credentials.username,
    credentials.password,
  );
  if (!authenticated) {
    return NextResponse.json(
      { error: "Username or password is incorrect." },
      { status: 401 },
    );
  }

  const session = await createSession(
    authenticated.id,
    credentials.remember === true,
    authenticated.user,
  );
  const response = NextResponse.json({ user: authenticated.user });
  response.cookies.set(authCookieName, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    ...(session.maxAge ? { maxAge: session.maxAge } : {}),
  });
  return response;
}
