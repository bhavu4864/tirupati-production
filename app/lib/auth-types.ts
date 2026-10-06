export type UserRole =
  | "ADMIN"
  | "PRODUCTION"
  | "QUALITY"
  | "DISPATCH"
  | "VIEWER";

export type AuthUser = {
  username: string;
  name: string;
  role: UserRole;
};

export function isUserRole(value: unknown): value is UserRole {
  return (
    value === "ADMIN" ||
    value === "PRODUCTION" ||
    value === "QUALITY" ||
    value === "DISPATCH" ||
    value === "VIEWER"
  );
}

export const roleRoutes: Record<UserRole, string[]> = {
  ADMIN: ["/", "/orders", "/production", "/wip", "/machine", "/inspection", "/dispatch", "/users", "/machine-master"],
  PRODUCTION: ["/", "/orders", "/production", "/wip", "/machine"],
  QUALITY: ["/", "/orders", "/production", "/wip", "/inspection"],
  DISPATCH: ["/", "/orders", "/dispatch"],
  VIEWER: ["/"],
};

export function canAccessRoute(role: UserRole, pathname: string) {
  return roleRoutes[role].includes(pathname);
}
