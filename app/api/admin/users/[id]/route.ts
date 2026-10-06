import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/admin-api";
import { isValidRole, isValidUsername, updateUser } from "../../../../lib/auth-users";

async function readJson(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await requireAdmin();
  if (access.response) return access.response;
  const body = await readJson(request);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Enter valid user details." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.trim().length > 120 ||
    typeof input.username !== "string" ||
    !isValidUsername(input.username) ||
    !isValidRole(input.role) ||
    typeof input.active !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Enter a name, valid username/email, valid role, and active status." },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  try {
    const user = await updateUser(id, {
      name: input.name,
      username: input.username,
      role: input.role,
      active: input.active,
    }, { id: access.user!.id, username: access.user!.username });
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }
    return NextResponse.json({ user });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "That username/email is already in use." },
        { status: 409 },
      );
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}
