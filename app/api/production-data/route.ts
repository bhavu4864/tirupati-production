import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName, getSessionIdentity } from "../../lib/auth-session";
import { getProductionSnapshot, saveProductionSnapshot } from "../../lib/production-db";

async function getIdentity() {
  const cookieStore = await cookies();
  return getSessionIdentity(cookieStore.get(authCookieName)?.value);
}

export async function GET() {
  const identity = await getIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const snapshot = await getProductionSnapshot();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const identity = await getIdentity();
  if (!identity) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid production-data request." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid production-data request." }, { status: 400 });
  }
  const input = body as {
    state?: unknown;
    version?: unknown;
    mutationId?: unknown;
    kind?: unknown;
    renames?: unknown;
  };
  if (
    typeof input.version !== "number" ||
    typeof input.mutationId !== "string" ||
    typeof input.kind !== "string" ||
    (input.renames !== undefined &&
      (!Array.isArray(input.renames) ||
        input.renames.some(
          (rename) =>
            !rename ||
            typeof rename !== "object" ||
            !("from" in rename) ||
            !("to" in rename) ||
            typeof rename.from !== "string" ||
            typeof rename.to !== "string",
        )))
  ) {
    return NextResponse.json({ error: "Invalid production-data request." }, { status: 400 });
  }
  try {
    const snapshot = await saveProductionSnapshot(
      {
        state: input.state,
        version: input.version,
        mutationId: input.mutationId,
        kind: input.kind,
        renames: input.renames as Array<{ from: string; to: string }> | undefined,
      },
      { user: identity, userId: identity.id },
    );
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const details = typeof error === "object" && error !== null
      ? error as { status?: unknown; code?: unknown }
      : null;
    const databaseCode = typeof details?.code === "string" ? details.code : "";
    const status =
      typeof details?.status === "number"
        ? details.status
        : databaseCode === "23505"
          ? 409
          : databaseCode.startsWith("22") || databaseCode.startsWith("23")
            ? 400
            : databaseCode
              ? 500
              : 400;
    if (status === 500) console.error("Production data transaction failed.", error);
    return NextResponse.json(
      {
        error: status === 500
          ? "Production data could not be saved."
          : error instanceof Error
            ? error.message
            : "Production data could not be saved.",
      },
      { status },
    );
  }
}
