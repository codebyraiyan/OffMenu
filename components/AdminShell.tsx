"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    setLoggingOut(true);
    setError("");

    try {
      const response = await fetch("/api/admin/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Unable to log out. Please try again.");
      }

      router.replace("/admin/login");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to log out. Please try again."
      );
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="container flex min-h-16 flex-wrap items-center justify-between gap-4 py-3">
          <Link
            href="/admin"
            className="font-semibold tracking-tight"
          >
            OFFMENU
          </Link>

          <nav className="flex flex-wrap items-center gap-4 text-sm text-neutral-600 sm:gap-6">
            <Link href="/admin">Overview</Link>

            <Link href="/admin/restaurants">
              Restaurants
            </Link>

            <Link href="/admin/orders">Orders</Link>

            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="rounded-lg border border-neutral-300 px-3 py-2 font-medium text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loggingOut ? "Logging out..." : "Logout"}
            </button>
          </nav>
        </div>

        {error && (
          <p
            role="alert"
            className="container pb-3 text-sm text-red-600"
          >
            {error}
          </p>
        )}
      </header>

      <main className="container py-10">
        {children}
      </main>
    </div>
  );
}