"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { canAccessRoute } from "../lib/auth-types";
import { useAuth } from "./auth-provider";

const navigationItems = [
  { label: "Orders", href: "/orders" },
  { label: "Machine Data", href: "/machine" },
];

export default function MainNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, ready, setUser } = useAuth();
  const [logoutError, setLogoutError] = useState("");

  async function logout() {
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setLogoutError("Unable to log out. Please try again.");
        return;
      }
      setUser(null);
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Unable to log out. Please try again.");
    }
  }

  return (
    <nav className="border-b bg-white" aria-label="Main navigation">
      <div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-4 sm:px-6 md:flex-row md:items-center">
        <div className="flex gap-2 overflow-x-auto">
        {ready && user && navigationItems.filter((item) =>
          canAccessRoute(user.role, item.href),
        ).map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium ${
                isActive
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        </div>
        {ready && user && (
          <div className="flex shrink-0 items-center gap-3 py-2 text-xs sm:text-sm">
            <span className="text-slate-600">
              <strong className="text-slate-800">{user.name}</strong>
              <span className="mx-1 text-slate-300">•</span>
              <span className="font-semibold text-blue-700">{user.role}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        )}
      </div>
      {logoutError && <p role="alert" className="px-4 pb-2 text-right text-xs text-red-600">{logoutError}</p>}
    </nav>
  );
}
