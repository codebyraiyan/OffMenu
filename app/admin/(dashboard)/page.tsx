import Link from "next/link";
import { count } from "drizzle-orm";

import { db } from "@/db";
import { orders, restaurants } from "@/db/schema";

export default async function AdminDashboardPage() {
  const [restaurantResult, orderResult] = await Promise.all([
    db.select({ count: count() }).from(restaurants),
    db.select({ count: count() }).from(orders)
  ]);

  const restaurantCount = restaurantResult[0]?.count ?? 0;
  const orderCount = orderResult[0]?.count ?? 0;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-neutral-500">OFFMENU ADMIN</p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Overview
        </h1>

        <p className="mt-2 text-sm text-neutral-500">
          Manage your restaurants, menus and orders.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="text-sm text-neutral-500">
            Restaurants
          </p>

          <p className="mt-3 text-3xl font-semibold">
            {restaurantCount}
          </p>

          <Link
            href="/admin/restaurants"
            className="mt-5 inline-block text-sm font-medium underline underline-offset-4"
          >
            Manage restaurants →
          </Link>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <p className="text-sm text-neutral-500">
            Orders
          </p>

          <p className="mt-3 text-3xl font-semibold">
            {orderCount}
          </p>

          <Link
            href="/admin/orders"
            className="mt-5 inline-block text-sm font-medium underline underline-offset-4"
          >
            View orders →
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold">
          Quick actions
        </h2>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/admin/restaurants/new"
            className="rounded-xl bg-black px-4 py-3 text-sm font-medium !text-white"
          >
            Add restaurant
          </Link>

          <Link
            href="/admin/restaurants"
            className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-900"
          >
            Manage restaurants
          </Link>

          <Link
            href="/admin/orders"
            className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-900"
          >
            View orders
          </Link>
        </div>
      </div>
    </div>
  );
}