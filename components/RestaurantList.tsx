
"use client";

import { useState } from "react";
import Link from "next/link";

type Restaurant = {
  id: number;
  name: string;
  description: string | null;
  phone: string | null;
  area: string | null;
  isOpen: boolean;
  isActive: boolean;
};

type RestaurantListProps = {
  restaurants: Restaurant[];
};

export default function RestaurantList({
  restaurants: initialRestaurants,
}: RestaurantListProps) {
  const [restaurants, setRestaurants] = useState(initialRestaurants);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRestaurants = restaurants.filter((restaurant) =>
    !normalizedQuery ||
    restaurant.name.toLowerCase().includes(normalizedQuery) ||
    (restaurant.area ?? "").toLowerCase().includes(normalizedQuery) ||
    (restaurant.phone ?? "").toLowerCase().includes(normalizedQuery) ||
    String(restaurant.id).includes(normalizedQuery),
  );
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredRestaurants.length / pageSize));
  const visibleRestaurants = filteredRestaurants.slice(page * pageSize, (page + 1) * pageSize);

  async function handleToggleActive(restaurant: Restaurant) {
    const nextIsActive = !restaurant.isActive;

    const confirmed = window.confirm(
      nextIsActive
        ? `Activate "${restaurant.name}"?\n\nIt will become eligible to appear on the customer marketplace.`
        : `Deactivate "${restaurant.name}"?\n\nIt should no longer be available to customers for new orders. Its existing order history will be preserved.`
    );

    if (!confirmed) return;

    setUpdatingId(restaurant.id);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/admin/restaurants/${restaurant.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isActive: nextIsActive,
          }),
        }
      );

      const data: {
        error?: string;
        message?: string;
        restaurant?: Restaurant;
      } = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Failed to update restaurant status."
        );
      }

      if (!data.restaurant) {
        throw new Error(
          "The server did not return the updated restaurant."
        );
      }

      setRestaurants((current) =>
        current.map((item) =>
          item.id === restaurant.id
            ? { ...item, isActive: data.restaurant!.isActive }
            : item
        )
      );

      setFeedback({
        type: "success",
        message:
          data.message ||
          `"${restaurant.name}" ${
            nextIsActive ? "activated" : "deactivated"
          } successfully.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while updating the restaurant.",
      });
    } finally {
      setUpdatingId(null);
    }
  }

  if (restaurants.length === 0) {
    return (
      <div className="space-y-4">
        {feedback && (
          <p
            role="status"
            aria-live="polite"
            className={
              feedback.type === "success"
                ? "text-sm text-green-700"
                : "text-sm text-red-600"
            }
          >
            {feedback.message}
          </p>
        )}

        <div className="rounded-xl border border-neutral-200 p-8 text-center">
          <p className="text-neutral-600">No restaurants found.</p>
          <Link
            href="/admin/restaurants/new"
            className="mt-4 inline-block rounded-lg bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Add restaurant
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={
            feedback.type === "success"
              ? "text-sm text-green-700"
              : "text-sm text-red-600"
          }
        >
          {feedback.message}
        </p>
      )}

      <input
        value={query}
        onChange={(event) => { setQuery(event.target.value); setPage(0); }}
        placeholder="Search restaurant name, area, phone, or ID"
        aria-label="Search restaurants"
        className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm"
      />

      {visibleRestaurants.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-500">No restaurants match this search.</p>
      ) : (
      <div className="grid gap-4">
        {visibleRestaurants.map((restaurant) => (
          <div
            key={restaurant.id}
            className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <h2 className="font-semibold text-neutral-900">
                {restaurant.name}
              </h2>

              {restaurant.description && (
                <p className="mt-1 text-sm text-neutral-600">
                  {restaurant.description}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-neutral-500">
                {restaurant.area && <span>{restaurant.area}</span>}
                {restaurant.phone && <span>{restaurant.phone}</span>}
                <span>
                  Ordering status: {restaurant.isOpen ? "Open" : "Closed"}
                </span>
                <span
                  className={
                    restaurant.isActive
                      ? "font-medium text-green-700"
                      : "font-medium text-red-600"
                  }
                >
                  Marketplace: {restaurant.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Link
                href={`/admin/restaurants/${restaurant.id}`}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                Manage
              </Link>

              <button
                type="button"
                onClick={() => handleToggleActive(restaurant)}
                disabled={updatingId !== null}
                aria-label={`${restaurant.isActive ? "Deactivate" : "Activate"} ${restaurant.name}`}
                className={
                  restaurant.isActive
                    ? "rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    : "rounded-lg border border-green-200 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                }
              >
                {updatingId === restaurant.id
                  ? "Updating..."
                  : restaurant.isActive
                    ? "Deactivate"
                    : "Activate"}
              </button>
            </div>
          </div>
        ))}
      </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-neutral-500">{filteredRestaurants.length} restaurants · page {page + 1} of {pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button>
          <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
