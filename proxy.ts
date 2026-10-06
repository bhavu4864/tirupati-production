import { NextResponse, type NextRequest } from "next/server";
import { authCookieName, getSessionUser } from "./app/lib/auth-session";
import { canAccessRoute } from "./app/lib/auth-types";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  const user = await getSessionUser(request.cookies.get(authCookieName)?.value);
  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (!canAccessRoute(user.role, pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
