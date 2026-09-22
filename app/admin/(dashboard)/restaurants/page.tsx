import Link from "next/link";
import { desc } from "drizzle-orm";

import { db } from "@/db";
import { restaurants } from "@/db/schema";

export default async function RestaurantsPage() {
  const rows = await db
    .select()
    .from(restaurants)
    .orderBy(desc(restaurants.createdAt));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-neutral-500">
            OFFMENU ADMIN
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Restaurants
          </h1>

          <p className="mt-2 text-sm text-neutral-500">
            Manage restaurants and their menus.
          </p>
        </div>

        <Link
          href="/admin/restaurants/new"
          className="inline-flex w-fit rounded-xl bg-black px-4 py-3 text-sm font-medium !text-white"
        >
          Add restaurant
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold">
            No restaurants yet
          </h2>

          <p className="mt-2 text-sm text-neutral-500">
            Add your first restaurant to start building its menu.
          </p>

          <Link
            href="/admin/restaurants/new"
            className="mt-6 inline-flex rounded-xl bg-black px-4 py-3 text-sm font-medium !text-white"
          >
            Add restaurant
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {rows.map((restaurant) => (
            <Link
              key={restaurant.id}
              href={`/admin/restaurants/${restaurant.id}`}
              className="group block rounded-2xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-400"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {restaurant.name}
                    </h2>

                    <span
                      className={
                        restaurant.isOpen
                          ? "rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700"
                          : "rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600"
                      }
                    >
                      {restaurant.isOpen ? "Open" : "Closed"}
                    </span>
                  </div>

                  {restaurant.description && (
                    <p className="mt-2 max-w-2xl text-sm text-neutral-500">
                      {restaurant.description}
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-neutral-500">
                    <span>
                      {restaurant.area}
                    </span>

                    <span>
                      {restaurant.phone}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 text-sm font-medium text-neutral-900">
                  Manage →
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}