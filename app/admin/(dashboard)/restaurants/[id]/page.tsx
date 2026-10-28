"use client";

import {
  FormEvent,
  useEffect,
  useState
} from "react";

import { useParams } from "next/navigation";

type Restaurant = {
  id: number;
  name: string;
  description: string | null;
  phone: string;
  whatsapp: string | null;
  address: string | null;
  area: string;
  imageUrl: string | null;
  isOpen: boolean;
};

type MenuItem = {
  id: number;
  restaurantId: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
};

export default function RestaurantPage() {
  const params = useParams();

  const id = String(params.id);

  const [restaurant, setRestaurant] =
    useState<Restaurant | null>(null);

  const [items, setItems] =
    useState<MenuItem[]>([]);

  const [menuSearch, setMenuSearch] = useState("");
  const [menuPage, setMenuPage] = useState(0);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [itemName, setItemName] =
    useState("");

  const [itemDescription, setItemDescription] =
    useState("");

  const [itemPrice, setItemPrice] =
    useState("");

  const [addingItem, setAddingItem] =
    useState(false);

  const [savingDetails, setSavingDetails] = useState(false);

  const filteredItems = items.filter((item) => {
    const query = menuSearch.trim().toLowerCase();
    return !query || item.name.toLowerCase().includes(query) ||
      (item.description ?? "").toLowerCase().includes(query);
  });
  const menuPageSize = 10;
  const menuPageCount = Math.max(1, Math.ceil(filteredItems.length / menuPageSize));
  const visibleItems = filteredItems.slice(menuPage * menuPageSize, (menuPage + 1) * menuPageSize);

  async function loadRestaurant() {
    setLoading(true);

    try {
      const response =
        await fetch(
          `/api/admin/restaurants/${id}`
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to load restaurant."
        );
      }

      setRestaurant(
        data.restaurant
      );

      setItems(data.menu);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load restaurant."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRestaurant();
  }, [id]);

  async function saveRestaurantDetails(event: FormEvent) {
    event.preventDefault();
    if (!restaurant) return;
    setSavingDetails(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/restaurants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: restaurant.name,
          description: restaurant.description,
          phone: restaurant.phone,
          whatsapp: restaurant.whatsapp,
          address: restaurant.address,
          area: restaurant.area,
          imageUrl: restaurant.imageUrl,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update restaurant details.");
      setRestaurant(result.restaurant);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update restaurant details.");
    } finally {
      setSavingDetails(false);
    }
  }

  async function addMenuItem(
    event: FormEvent
  ) {
    event.preventDefault();

    if (
      !itemName.trim() ||
      !itemPrice
    ) {
      return;
    }

    setAddingItem(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/admin/restaurants/${id}/menu`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              name: itemName,
              description:
                itemDescription,
              price:
                Number(itemPrice)
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to add menu item."
        );
      }

      setItems((current) => [
        ...current,
        data
      ]);
      setMenuPage(0);

      setItemName("");
      setItemDescription("");
      setItemPrice("");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to add menu item."
      );
    } finally {
      setAddingItem(false);
    }
  }

  async function toggleItem(
    item: MenuItem
  ) {
    try {
      const response =
        await fetch(
          `/api/admin/restaurants/${id}/menu/${item.id}`,
          {
            method: "PATCH",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              isAvailable:
                !item.isAvailable
            })
          }
        );

      if (!response.ok) {
        throw new Error(
          "Failed to update item."
        );
      }

      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                isAvailable:
                  !currentItem.isAvailable
              }
            : currentItem
        )
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to update item."
      );
    }
  }

  async function deleteItem(
    item: MenuItem
  ) {
    const confirmed =
      window.confirm(
        `Delete "${item.name}"?`
      );

    if (!confirmed) {
      return;
    }

    try {
      const response =
        await fetch(
          `/api/admin/restaurants/${id}/menu/${item.id}`,
          {
            method: "DELETE"
          }
        );

      if (!response.ok) {
        throw new Error(
          "Failed to delete item."
        );
      }

      setItems((current) =>
        current.filter(
          (currentItem) =>
            currentItem.id !==
            item.id
        )
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to delete item."
      );
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-sm text-neutral-500">
        Loading restaurant...
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="py-20">
        <p className="text-red-600">
          {error ||
            "Restaurant not found."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <p className="text-sm text-neutral-500">
            Restaurant
          </p>

          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {restaurant.name}
          </h1>

          <p className="mt-2 text-sm text-neutral-500">
            {restaurant.area}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs ${
            restaurant.isOpen
              ? "bg-green-100 text-green-700"
              : "bg-neutral-100 text-neutral-500"
          }`}
        >
          {restaurant.isOpen
            ? "Open"
            : "Closed"}
        </span>
      </div>

      {error && (
        <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {restaurant && (
        <form onSubmit={saveRestaurantDetails} className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="font-medium">Restaurant details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">Name<input required value={restaurant.name} onChange={(event) => setRestaurant({ ...restaurant, name: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3" /></label>
            <label className="text-sm font-medium">Area<input required value={restaurant.area} onChange={(event) => setRestaurant({ ...restaurant, area: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3" /></label>
            <label className="text-sm font-medium">Phone<input required value={restaurant.phone} onChange={(event) => setRestaurant({ ...restaurant, phone: event.target.value })} className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3" /></label>
            <label className="text-sm font-medium">WhatsApp<input value={restaurant.whatsapp ?? ""} onChange={(event) => setRestaurant({ ...restaurant, whatsapp: event.target.value || null })} className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3" /></label>
            <label className="text-sm font-medium">Address<input value={restaurant.address ?? ""} onChange={(event) => setRestaurant({ ...restaurant, address: event.target.value || null })} className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3" /></label>
            <label className="text-sm font-medium">Image URL<input value={restaurant.imageUrl ?? ""} onChange={(event) => setRestaurant({ ...restaurant, imageUrl: event.target.value || null })} className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3" /></label>
            <label className="text-sm font-medium sm:col-span-2">Description<textarea rows={3} value={restaurant.description ?? ""} onChange={(event) => setRestaurant({ ...restaurant, description: event.target.value || null })} className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3" /></label>
          </div>
          <button disabled={savingDetails} className="mt-4 rounded-xl bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50">{savingDetails ? "Saving…" : "Save details"}</button>
        </form>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-neutral-200 bg-white">
          <div className="flex items-center justify-between border-b border-neutral-200 p-5">
            <div>
              <h2 className="font-medium">
                Menu
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                {items.length} items
              </p>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium">
                No menu items
              </p>

              <p className="mt-2 text-sm text-neutral-500">
                Add the first item using the form.
              </p>
            </div>
          ) : (
            <>
            <div className="border-b border-neutral-200 p-4">
              <input
                value={menuSearch}
                onChange={(event) => { setMenuSearch(event.target.value); setMenuPage(0); }}
                placeholder="Search menu items"
                aria-label="Search menu items"
                className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm"
              />
            </div>
            {visibleItems.length === 0 ? (
              <p className="p-6 text-sm text-neutral-500">No items match this search.</p>
            ) : <div className="divide-y divide-neutral-200">
              {visibleItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-6 p-5"
                >
                  <div className="min-w-0">
                    <h3 className="font-medium">
                      {item.name}
                    </h3>

                    {item.description && (
                      <p className="mt-1 text-sm text-neutral-500">
                        {item.description}
                      </p>
                    )}

                    <p className="mt-2 text-sm font-medium">
                      {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(item.price)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() =>
                        toggleItem(item)
                      }
                      className={`rounded-full px-3 py-1.5 text-xs ${
                        item.isAvailable
                          ? "bg-green-100 text-green-700"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {item.isAvailable
                        ? "Available"
                        : "Unavailable"}
                    </button>

                    <button
                      onClick={() =>
                        deleteItem(item)
                      }
                      className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>}
            <div className="flex items-center justify-between border-t border-neutral-200 p-4 text-sm">
              <span className="text-neutral-500">{filteredItems.length} items · page {menuPage + 1} of {menuPageCount}</span>
              <div className="flex gap-2">
                <button type="button" disabled={menuPage === 0} onClick={() => setMenuPage((page) => Math.max(0, page - 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button>
                <button type="button" disabled={menuPage + 1 >= menuPageCount} onClick={() => setMenuPage((page) => Math.min(menuPageCount - 1, page + 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button>
              </div>
            </div>
            </>
          )}
        </section>

        <aside className="h-fit rounded-2xl border border-neutral-200 bg-white p-6">
          <h2 className="font-medium">
            Add menu item
          </h2>

          <form
            onSubmit={addMenuItem}
            className="mt-5 space-y-4"
          >
            <div>
              <label className="text-sm font-medium">
                Item name
              </label>

              <input
                value={itemName}
                onChange={(event) =>
                  setItemName(
                    event.target.value
                  )
                }
                placeholder="Chicken Biryani"
                className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black"
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Description
              </label>

              <textarea
                value={itemDescription}
                onChange={(event) =>
                  setItemDescription(
                    event.target.value
                  )
                }
                placeholder="Short description"
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black"
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Price
              </label>

              <div className="relative mt-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
                  ₹
                </span>

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={itemPrice}
                  onChange={(event) =>
                    setItemPrice(
                      event.target.value
                    )
                  }
                  placeholder="150"
                  className="w-full rounded-xl border border-neutral-300 py-3 pl-8 pr-4 text-sm outline-none focus:border-black"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={addingItem}
              className="w-full rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {addingItem
                ? "Adding..."
                : "Add menu item"}
            </button>
          </form>
        </aside>
      </div>

      <section className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="font-medium">
          Restaurant details
        </h2>

        <div className="mt-5 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <p className="text-neutral-400">
              Phone
            </p>

            <p className="mt-1">
              {restaurant.phone}
            </p>
          </div>

          <div>
            <p className="text-neutral-400">
              WhatsApp
            </p>

            <p className="mt-1">
              {restaurant.whatsapp ||
                restaurant.phone}
            </p>
          </div>

          <div>
            <p className="text-neutral-400">
              Area
            </p>

            <p className="mt-1">
              {restaurant.area}
            </p>
          </div>

          <div>
            <p className="text-neutral-400">
              Address
            </p>

            <p className="mt-1">
              {restaurant.address ||
                "Not provided"}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
