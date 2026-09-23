"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

type MenuItem = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
};

type OrderItem = {
  id: number;
  orderId: number;
  menuItemId: number;
  itemName: string;
  quantity: number;
  unitPrice: number;
  note: string | null;
  total: number;
};

type Order = {
  id: number;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string;
  deliveryAddress: string;
  customerNote: string | null;
  subtotal: number;
  platformFee: number;
  total: number;
  paymentMethod: string;
  status: string;
  createdAt: string | Date;
  items: OrderItem[];
};

type DashboardData = {
  restaurant: {
    id: number;
    name: string;
    isOpen: boolean;
  };
  menu: MenuItem[];
  orders: Order[];
};

const ACTIVE_STATUSES = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY"
];

const BILLABLE_STATUSES = [
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
];

const STATUS_LABELS: Record<
  string,
  string
> = {
  NEW: "New",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY:
    "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled"
};

const STATUS_CLASSES: Record<
  string,
  string
> = {
  NEW:
    "bg-red-100 text-red-700 border-red-200",
  ACCEPTED:
    "bg-blue-100 text-blue-700 border-blue-200",
  PREPARING:
    "bg-amber-100 text-amber-700 border-amber-200",
  OUT_FOR_DELIVERY:
    "bg-purple-100 text-purple-700 border-purple-200",
  DELIVERED:
    "bg-green-100 text-green-700 border-green-200",
  CANCELLED:
    "bg-neutral-100 text-neutral-500 border-neutral-200"
};

function formatTime(
  value: string | Date
) {
  return new Date(value).toLocaleTimeString(
    "en-IN",
    {
      hour: "numeric",
      minute: "2-digit"
    }
  );
}

function formatDate(
  value: string | Date
) {
  return new Date(value).toLocaleDateString(
    "en-IN",
    {
      day: "numeric",
      month: "short"
    }
  );
}

export default function RestaurantDashboardPage() {
  const [data, setData] =
    useState<DashboardData | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [updatingOrderId, setUpdatingOrderId] =
    useState<number | null>(null);

  const [range, setRange] =
    useState("today");

  const [activeTab, setActiveTab] =
    useState<
      "orders" | "menu"
    >("orders");

  const [notificationEnabled, setNotificationEnabled] =
    useState(false);

  const previousNewOrderIds =
    useRef<Set<number>>(
      new Set()
    );

  const audioContext =
    useRef<AudioContext | null>(
      null
    );

  const loadDashboard =
    useCallback(
      async (
        showLoader = false
      ) => {
        if (showLoader) {
          setLoading(true);
        }

        try {
          const response =
            await fetch(
              `/api/restaurants/dashboard?range=${range}`,
              {
                cache: "no-store"
              }
            );

          const result =
            await response.json();

          if (
            response.status === 401
          ) {
            window.location.href =
              "/restaurants/login";
            return;
          }

          if (!response.ok) {
            throw new Error(
              result.error ||
                "Failed to load dashboard."
            );
          }

          setData(result);
          setError("");
        } catch (error) {
          setError(
            error instanceof Error
              ? error.message
              : "Failed to load dashboard."
          );
        } finally {
          if (showLoader) {
            setLoading(false);
          }
        }
      },
      [range]
    );

  useEffect(() => {
    loadDashboard(true);
  }, [loadDashboard]);

  useEffect(() => {
    const interval =
      window.setInterval(() => {
        loadDashboard(false);
      }, 5000);

    return () =>
      window.clearInterval(
        interval
      );
  }, [loadDashboard]);

  useEffect(() => {
    if (!data) {
      return;
    }

    const newOrders =
      data.orders.filter(
        (order) =>
          order.status === "NEW"
      );

    const currentIds =
      new Set(
        newOrders.map(
          (order) => order.id
        )
      );

    const hasNewOrder =
      newOrders.some(
        (order) =>
          !previousNewOrderIds.current.has(
            order.id
          )
      );

    if (
      hasNewOrder &&
      previousNewOrderIds.current.size > 0
    ) {
      playAlertSound();

      if (
        notificationEnabled &&
        "Notification" in window &&
        Notification.permission ===
          "granted"
      ) {
        new Notification(
          "New OffMenu order",
          {
            body:
              "A new order is waiting for your acceptance."
          }
        );
      }
    }

    previousNewOrderIds.current =
      currentIds;
  }, [
    data,
    notificationEnabled
  ]);

  async function enableNotifications() {
    if (
      !("Notification" in window)
    ) {
      return;
    }

    const permission =
      await Notification.requestPermission();

    setNotificationEnabled(
      permission === "granted"
    );
  }

  function playAlertSound() {
    try {
      if (!audioContext.current) {
        audioContext.current =
          new AudioContext();
      }

      const context =
        audioContext.current;

      const oscillator =
        context.createOscillator();

      const gain =
        context.createGain();

      oscillator.type =
        "sine";

      oscillator.frequency.value =
        880;

      gain.gain.setValueAtTime(
        0.0001,
        context.currentTime
      );

      gain.gain.exponentialRampToValueAtTime(
        0.25,
        context.currentTime + 0.02
      );

      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.6
      );

      oscillator.connect(gain);
      gain.connect(
        context.destination
      );

      oscillator.start();
      oscillator.stop(
        context.currentTime + 0.6
      );
    } catch {
      // Browser may block audio until user interaction.
    }
  }

  async function updateOrderStatus(
    orderId: number,
    status: string
  ) {
    setUpdatingOrderId(
      orderId
    );

    try {
      const response =
        await fetch(
          "/api/restaurants/orders/status",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              orderId,
              status
            })
          }
        );

      const result =
        await response.json();

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Failed to update order."
        );
      }

      await loadDashboard(false);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to update order."
      );
    } finally {
      setUpdatingOrderId(
        null
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="animate-pulse">
            <div className="h-8 w-48 rounded bg-neutral-200" />
            <div className="mt-3 h-4 w-72 rounded bg-neutral-200" />

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <div className="h-28 rounded-2xl bg-neutral-200" />
              <div className="h-28 rounded-2xl bg-neutral-200" />
              <div className="h-28 rounded-2xl bg-neutral-200" />
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (error && !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
        <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-6">
          <h1 className="text-lg font-semibold">
            Something went wrong
          </h1>

          <p className="mt-2 text-sm text-red-600">
            {error}
          </p>

          <button
            onClick={() =>
              loadDashboard(true)
            }
            className="mt-5 rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!data) {
    return null;
  }

  const newOrders =
    data.orders.filter(
      (order) =>
        order.status === "NEW"
    );

  const activeOrders =
    data.orders.filter(
      (order) =>
        ACTIVE_STATUSES.includes(
          order.status
        )
    );

  const billableOrders =
    data.orders.filter(
      (order) =>
        BILLABLE_STATUSES.includes(
          order.status
        )
    );

  const totalFees =
    billableOrders.reduce(
      (sum, order) =>
        sum + order.platformFee,
      0
    );

  return (
    <main className="min-h-screen bg-neutral-50">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {/* HEADER */}
        <header className="flex flex-col gap-4 border-b border-neutral-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              OFFMENU
            </p>

            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              {data.restaurant.name}
            </h1>

            <p className="mt-1 text-sm text-neutral-500">
              Restaurant dashboard
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${
                data.restaurant.isOpen
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  data.restaurant.isOpen
                    ? "bg-green-500"
                    : "bg-red-500"
                }`}
              />

              {data.restaurant.isOpen
                ? "Open"
                : "Closed"}
            </div>

            <button
              onClick={
                enableNotifications
              }
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-100"
            >
              {notificationEnabled
                ? "🔔 Alerts on"
                : "🔔 Enable alerts"}
            </button>
          </div>
        </header>

        {/* NEW ORDER ALERT */}
        {newOrders.length > 0 && (
          <section className="mt-5 rounded-2xl border-2 border-red-300 bg-red-50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="animate-pulse text-xl">
                    🔴
                  </span>

                  <h2 className="text-lg font-bold text-red-800">
                    {newOrders.length === 1
                      ? "1 new order"
                      : `${newOrders.length} new orders`}
                  </h2>
                </div>

                <p className="mt-1 text-sm text-red-700">
                  These orders are waiting for
                  you to accept them.
                </p>
              </div>

              <button
                onClick={() => {
                  playAlertSound();

                  document
                    .getElementById(
                      "orders"
                    )
                    ?.scrollIntoView({
                      behavior: "smooth"
                    });
                }}
                className="rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700"
              >
                View orders
              </button>
            </div>
          </section>
        )}

        {/* STATS */}
        <section className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-sm text-neutral-500">
              New orders
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {newOrders.length}
            </p>

            <p className="mt-1 text-xs text-neutral-400">
              Waiting for acceptance
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-sm text-neutral-500">
              Active orders
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {activeOrders.length}
            </p>

            <p className="mt-1 text-xs text-neutral-400">
              Currently being handled
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-sm text-neutral-500">
              OffMenu fees
            </p>

            <p className="mt-2 text-3xl font-semibold">
              ₹
              {totalFees.toLocaleString(
                "en-IN"
              )}
            </p>

            <p className="mt-1 text-xs text-neutral-400">
              Accepted and completed orders
            </p>
          </div>
        </section>

        {/* TABS */}
        <div className="mt-8 flex items-center gap-2 border-b border-neutral-200">
          <button
            onClick={() =>
              setActiveTab(
                "orders"
              )
            }
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              activeTab === "orders"
                ? "border-black text-black"
                : "border-transparent text-neutral-500"
            }`}
          >
            Orders
            {newOrders.length > 0 && (
              <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
                {newOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={() =>
              setActiveTab(
                "menu"
              )
            }
            className={`border-b-2 px-4 py-3 text-sm font-medium ${
              activeTab === "menu"
                ? "border-black text-black"
                : "border-transparent text-neutral-500"
            }`}
          >
            Menu
          </button>
        </div>

        {/* ORDERS */}
        {activeTab === "orders" && (
          <section
            id="orders"
            className="mt-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">
                  Orders
                </h2>

                <p className="mt-1 text-sm text-neutral-500">
                  Orders update automatically.
                </p>
              </div>

              <select
                value={range}
                onChange={(event) =>
                  setRange(
                    event.target.value
                  )
                }
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none"
              >
                <option value="hour">
                  Last hour
                </option>

                <option value="3hours">
                  Last 3 hours
                </option>

                <option value="6hours">
                  Last 6 hours
                </option>

                <option value="today">
                  Today
                </option>

                <option value="yesterday">
                  Yesterday
                </option>
              </select>
            </div>

            <div className="mt-5 space-y-4">
              {data.orders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
                  <p className="font-medium">
                    No orders yet
                  </p>

                  <p className="mt-1 text-sm text-neutral-500">
                    Orders from OffMenu customers
                    will appear here.
                  </p>
                </div>
              ) : (
                data.orders.map(
                  (order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      updating={
                        updatingOrderId ===
                        order.id
                      }
                      onStatusChange={
                        updateOrderStatus
                      }
                    />
                  )
                )
              )}
            </div>
          </section>
        )}

        {/* MENU */}
        {activeTab === "menu" && (
          <section className="mt-6">
            <div>
              <h2 className="text-xl font-semibold">
                Menu
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                Menu availability management
                will appear here.
              </p>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.menu.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
                  <p className="font-medium">
                    No menu items
                  </p>

                  <p className="mt-1 text-sm text-neutral-500">
                    Add menu items from the admin
                    panel.
                  </p>
                </div>
              ) : (
                data.menu.map(
                  (item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-medium">
                            {item.name}
                          </h3>

                          {item.description && (
                            <p className="mt-1 text-sm text-neutral-500">
                              {item.description}
                            </p>
                          )}
                        </div>

                        <span className="whitespace-nowrap text-sm font-semibold">
                          ₹
                          {item.price.toLocaleString(
                            "en-IN"
                          )}
                        </span>
                      </div>

                      <div className="mt-4">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${
                            item.isAvailable
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                        >
                          {item.isAvailable
                            ? "Available"
                            : "Unavailable"}
                        </span>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </section>
        )}

        {/* FOOTER */}
        <footer className="mt-12 border-t border-neutral-200 py-6 text-center text-xs text-neutral-400">
          OffMenu Restaurant Panel
        </footer>
      </div>
    </main>
  );
}

function OrderCard({
  order,
  updating,
  onStatusChange
}: {
  order: Order;
  updating: boolean;
  onStatusChange: (
    orderId: number,
    status: string
  ) => void;
}) {
  const nextAction =
    order.status === "NEW"
      ? {
          label: "Accept Order",
          status: "ACCEPTED",
          className:
            "bg-green-600 hover:bg-green-700"
        }
      : order.status === "ACCEPTED"
      ? {
          label: "Start Preparing",
          status: "PREPARING",
          className:
            "bg-black hover:bg-neutral-800"
        }
      : order.status ===
        "PREPARING"
      ? {
          label: "Out for Delivery",
          status:
            "OUT_FOR_DELIVERY",
          className:
            "bg-black hover:bg-neutral-800"
        }
      : order.status ===
        "OUT_FOR_DELIVERY"
      ? {
          label: "Mark Delivered",
          status: "DELIVERED",
          className:
            "bg-green-600 hover:bg-green-700"
        }
      : null;

  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-white ${
        order.status === "NEW"
          ? "border-red-300 shadow-sm"
          : "border-neutral-200"
      }`}
    >
      <div className="border-b border-neutral-200 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">
                #{order.orderNumber}
              </h3>

              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  STATUS_CLASSES[
                    order.status
                  ] ||
                  "border-neutral-200 bg-neutral-100 text-neutral-600"
                }`}
              >
                {STATUS_LABELS[
                  order.status
                ] ||
                  order.status}
              </span>
            </div>

            <p className="mt-1 text-sm text-neutral-500">
              {formatDate(
                order.createdAt
              )}{" "}
              at{" "}
              {formatTime(
                order.createdAt
              )}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xl font-semibold">
              ₹
              {order.total.toLocaleString(
                "en-IN"
              )}
            </p>

            <p className="text-xs text-neutral-500">
              COD / UPI
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[1fr_280px]">
        <div>
          <h4 className="text-sm font-semibold">
            Items
          </h4>

          <div className="mt-3 space-y-3">
            {order.items.map(
              (item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {item.quantity} ×{" "}
                      {item.itemName}
                    </p>

                    {item.note && (
                      <p className="mt-1 text-xs text-neutral-500">
                        Note:{" "}
                        {item.note}
                      </p>
                    )}
                  </div>

                  <p className="whitespace-nowrap text-sm font-medium">
                    ₹
                    {item.total.toLocaleString(
                      "en-IN"
                    )}
                  </p>
                </div>
              )
            )}
          </div>

          {order.customerNote && (
            <div className="mt-5 rounded-xl bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Customer note
              </p>

              <p className="mt-1 text-sm text-neutral-700">
                {order.customerNote}
              </p>
            </div>
          )}
        </div>

        <div className="rounded-xl bg-neutral-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Delivery
          </p>

          <p className="mt-2 text-sm leading-6 text-neutral-700">
            {order.deliveryAddress}
          </p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Customer
          </p>

          <p className="mt-2 text-sm text-neutral-700">
            {order.customerName ||
              "Customer"}
          </p>

          <p className="mt-1 text-sm text-neutral-500">
            {order.customerPhone}
          </p>
        </div>
      </div>

      {(nextAction ||
        order.status ===
          "NEW") && (
        <div className="flex flex-col gap-3 border-t border-neutral-200 bg-neutral-50 p-4 sm:flex-row sm:justify-end">
          {order.status ===
            "NEW" && (
            <button
              onClick={() =>
                onStatusChange(
                  order.id,
                  "CANCELLED"
                )
              }
              disabled={updating}
              className="rounded-xl border border-neutral-300 bg-white px-5 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
            >
              Cancel
            </button>
          )}

          {nextAction && (
            <button
              onClick={() =>
                onStatusChange(
                  order.id,
                  nextAction.status
                )
              }
              disabled={updating}
              className={`rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 ${nextAction.className}`}
            >
              {updating
                ? "Updating..."
                : nextAction.label}
            </button>
          )}
        </div>
      )}
    </article>
  );
}