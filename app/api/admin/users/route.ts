import { NextResponse } from "next/server";
import { requireAdmin } from "../../../lib/admin-api";
import { createUser, isValidRole, isValidUsername, listUsers } from "../../../lib/auth-users";
import { isStrongPassword } from "../../../lib/password";

async function readJson(request: Request) {
  try {
    return await request.json() as unknown;
  } catch {
    return null;
  }
}

export async function GET() {
  const access = await requireAdmin();
  if (access.response) return access.response;
  const users = await listUsers();
  return NextResponse.json({ users }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
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
    typeof input.password !== "string" ||
    !isStrongPassword(input.password) ||
    !isValidRole(input.role)
  ) {
    return NextResponse.json(
      {
        error:
          "Enter a name, valid username/email, valid role, and a password of at least 12 characters with uppercase, lowercase, a number, and a symbol.",
      },
      { status: 400 },
    );
  }

  try {
    const user = await createUser({
      name: input.name,
      username: input.username,
      password: input.password,
      role: input.role,
    }, { id: access.user!.id, username: access.user!.username });
    return NextResponse.json({ user }, { status: 201 });
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
