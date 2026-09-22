import Link from "next/link";

export default function AdminShell({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-200 bg-white">
        <div className="container flex h-16 items-center justify-between">
          <Link
            href="/admin"
            className="font-semibold tracking-tight"
          >
            OFFMENU
          </Link>

          <nav className="flex gap-6 text-sm text-neutral-600">
            <Link href="/admin">
              Overview
            </Link>

            <Link href="/admin/restaurants">
              Restaurants
            </Link>

            <Link href="/admin/orders">
              Orders
            </Link>
          </nav>
        </div>
      </header>

      <main className="container py-10">
        {children}
      </main>
    </div>
  );
}