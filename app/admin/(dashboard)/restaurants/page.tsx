
import Link from "next/link";
import { desc } from "drizzle-orm";

import { db } from "@/db";
import { restaurants } from "@/db/schema";
import RestaurantList from "@/components/RestaurantList";

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
            Manage restaurants, their menus, and marketplace availability.
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
        <RestaurantList
          restaurants={rows.map((restaurant) => ({
            id: restaurant.id,
            name: restaurant.name,
            description: restaurant.description,
            phone: restaurant.phone,
            area: restaurant.area,
            isOpen: restaurant.isOpen,
            isActive: restaurant.isActive,
          }))}
        />
      )}
    </div>
  );
}
