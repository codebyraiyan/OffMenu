"use client";

import {
  FormEvent,
  useState
} from "react";

import { useRouter } from "next/navigation";

export default function NewRestaurantPage() {
  const router = useRouter();

  const [name, setName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [whatsapp, setWhatsapp] =
    useState("");

  const [address, setAddress] =
    useState("");

  const [area, setArea] =
    useState("");

  const [imageUrl, setImageUrl] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event: FormEvent
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/admin/restaurants",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body: JSON.stringify({
              name,
              description,
              phone,
              whatsapp:
                whatsapp || phone,
              address,
              area,
              imageUrl
            })
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Failed to create restaurant."
        );
      }

      router.push(
        `/admin/restaurants/${data.id}`
      );

      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Something went wrong."
      );

      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div>
        <p className="text-sm text-neutral-500">
          Restaurants
        </p>

        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          Add restaurant
        </h1>

        <p className="mt-2 text-sm text-neutral-500">
          Add the restaurant details that customers
          will see and that OffMenu will use for orders.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 space-y-6 rounded-2xl border border-neutral-200 bg-white p-6"
      >
        <div>
          <label className="text-sm font-medium">
            Restaurant name
          </label>

          <input
            value={name}
            onChange={(event) =>
              setName(event.target.value)
            }
            placeholder="Example: Al Arabian"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">
            Description
          </label>

          <textarea
            value={description}
            onChange={(event) =>
              setDescription(
                event.target.value
              )
            }
            placeholder="Short description of the restaurant"
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="text-sm font-medium">
              Phone
            </label>

            <input
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value)
              }
              placeholder="+91..."
              className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium">
              WhatsApp
            </label>

            <input
              value={whatsapp}
              onChange={(event) =>
                setWhatsapp(
                  event.target.value
                )
              }
              placeholder="Leave blank if same as phone"
              className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">
            Area
          </label>

          <input
            value={area}
            onChange={(event) =>
              setArea(event.target.value)
            }
            placeholder="Example: Chandapura"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
            required
          />
        </div>

        <div>
          <label className="text-sm font-medium">
            Restaurant address
          </label>

          <textarea
            value={address}
            onChange={(event) =>
              setAddress(
                event.target.value
              )
            }
            placeholder="Full restaurant address"
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
          />
        </div>

        <div>
          <label className="text-sm font-medium">
            Image URL
          </label>

          <input
            value={imageUrl}
            onChange={(event) =>
              setImageUrl(
                event.target.value
              )
            }
            placeholder="Optional"
            className="mt-2 w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:border-black"
          />
        </div>

        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-6">
          <button
            type="button"
            onClick={() =>
              router.push(
                "/admin/restaurants"
              )
            }
            className="rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading
              ? "Creating..."
              : "Create restaurant"}
          </button>
        </div>
      </form>
    </div>
  );
}