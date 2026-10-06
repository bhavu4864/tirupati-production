import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../../lib/admin-api";
import { resetUserPassword } from "../../../../../lib/auth-users";
import { isStrongPassword } from "../../../../../lib/password";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter a valid password." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("password" in body) ||
    typeof body.password !== "string" ||
    !isStrongPassword(body.password)
  ) {
    return NextResponse.json(
      {
        error:
          "The new password must be at least 12 characters with uppercase, lowercase, a number, and a symbol.",
      },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  if (!(await resetUserPassword(id, body.password, {
    id: access.user!.id,
    username: access.user!.username,
  }))) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
