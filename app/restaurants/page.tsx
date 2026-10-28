"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
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
  deliveryFee: number;
  customerPlatformFee: number;
  platformFee: number;
  feeModel: string;
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
  feeSummary: {
    orderCount: number;
    totalFoodValue: number;
    totalDeliveryFees: number;
    totalPlatformFees: number;
    totalCustomerPlatformFees: number;
    totalLegacyPlatformFees: number;
    totalCustomerValue: number;
  };
};

const ACTIVE_STATUSES = [
  "NEW",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
];

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const STATUS_CLASSES: Record<string, string> = {
  NEW: "bg-red-100 text-red-700 border-red-200",
  ACCEPTED: "bg-blue-100 text-blue-700 border-blue-200",
  PREPARING: "bg-amber-100 text-amber-700 border-amber-200",
  OUT_FOR_DELIVERY: "bg-purple-100 text-purple-700 border-purple-200",
  DELIVERED: "bg-green-100 text-green-700 border-green-200",
  CANCELLED: "bg-neutral-100 text-neutral-500 border-neutral-200",
};

function formatTime(value: string | Date) {
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export default function RestaurantDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const [range, setRange] = useState("today");
  const [loadedRange, setLoadedRange] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");
  const [orderPage, setOrderPage] = useState(0);
  const [activeTab, setActiveTab] = useState<"orders" | "menu">("orders");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [alertSetupMessage, setAlertSetupMessage] = useState("");
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuError, setMenuError] = useState("");
  const [editingMenuItemId, setEditingMenuItemId] = useState<number | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPrice, setEditPrice] = useState("");

  const previousNewOrderIds = useRef<Set<number>>(new Set());
  const previousNewOrderRange = useRef<string | null>(null);
  const audioContext = useRef<AudioContext | null>(null);

  const loadDashboard = useCallback(
    async (showLoader = false) => {
      if (showLoader) {
        setLoading(true);
      }

      try {
        const response = await fetch(
          `/api/restaurants/dashboard?range=${range}`,
          {
            cache: "no-store",
          },
        );

        const result = await response.json();

        if (response.status === 401) {
          window.location.href = "/restaurants/login";
          return;
        }

        if (!response.ok) {
          throw new Error(result.error || "Failed to load dashboard.");
        }

        setData(result);
        setLoadedRange(range);
        setError("");
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Failed to load dashboard.",
        );
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [range],
  );

  useEffect(() => {
    loadDashboard(true);
  }, [loadDashboard]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadDashboard(false);
    }, 5000);

    return () => window.clearInterval(interval);
  }, [loadDashboard]);

  useEffect(() => {
    if (!data || loadedRange !== range) {
      return;
    }

    const newOrders = data.orders.filter(
      (order) => order.status === "NEW",
    );

    const currentIds = new Set(
      newOrders.map((order) => order.id),
    );

    const hasNewOrder = newOrders.some(
      (order) => !previousNewOrderIds.current.has(order.id),
    );

    const isBaseline = previousNewOrderRange.current !== range;
    if (hasNewOrder && !isBaseline) {
      if (soundEnabled) {
        playAlertSound();
      }

      if (
        notificationEnabled &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("New OffMenu order", {
          body: "A new order is waiting for your acceptance.",
        });
      }
    }

    previousNewOrderIds.current = currentIds;
    previousNewOrderRange.current = range;
  }, [data, loadedRange, notificationEnabled, range, soundEnabled]);

  async function enableNotifications() {
    setAlertSetupMessage("");
    let permissionGranted = false;

    if ("Notification" in window) {
      permissionGranted =
        (await Notification.requestPermission()) === "granted";
    }

    setNotificationEnabled(permissionGranted);

    try {
      if (!audioContext.current) {
        audioContext.current = new AudioContext();
      }
      await audioContext.current.resume();
      const enabled = audioContext.current.state === "running";
      setSoundEnabled(enabled);
      setAlertSetupMessage(
        enabled
          ? "Sound is enabled for this dashboard. Your browser may suspend audio in a background tab; desktop notifications are the fallback."
          : "The browser has suspended audio. Keep this dashboard open and enable sound again after interacting with the page.",
      );
    } catch {
      setSoundEnabled(false);
      setAlertSetupMessage(
        "Audio is blocked by the browser. Allow sound after interacting with the page; desktop notifications may still alert you.",
      );
    }
  }

  function playAlertSound() {
    try {
      const context = audioContext.current;
      if (!context || context.state !== "running") {
        setSoundEnabled(false);
        setAlertSetupMessage(
          "The browser suspended dashboard audio. Re-enable sound after interacting with the page.",
        );
        return;
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 880;

      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.25,
        context.currentTime + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.6,
      );

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.6);
    } catch {
      // Browser may block audio until user interaction.
    }
  }

  async function toggleRestaurantAvailability() {
    if (!data) return;
    setAvailabilitySaving(true);
    setError("");
    try {
      const response = await fetch("/api/restaurants/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOpen: !data.restaurant.isOpen }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update ordering status.");
      setData((current) => current ? {
        ...current,
        restaurant: { ...current.restaurant, isOpen: result.restaurant.isOpen },
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update ordering status.");
    } finally {
      setAvailabilitySaving(false);
    }
  }

  async function updateOrderStatus(
    orderId: number,
    status: string,
  ) {
    setUpdatingOrderId(orderId);

    try {
      const response = await fetch(
        "/api/restaurants/orders/status",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderId,
            status,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update order.");
      }

      await loadDashboard(false);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Failed to update order.",
      );
    } finally {
      setUpdatingOrderId(null);
    }
  }

  async function addMenuItem() {
    setMenuError("");

    const name = newItemName.trim();
    const description = newItemDescription.trim();
    const price = Number(newItemPrice);

    if (!name) {
      setMenuError("Enter an item name.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setMenuError("Enter a valid price.");
      return;
    }

    setMenuSaving(true);

    try {
      const response = await fetch(
        "/api/restaurants/menu",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            description,
            price,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to add menu item.");
      }

      setNewItemName("");
      setNewItemDescription("");
      setNewItemPrice("");

      await loadDashboard(false);
    } catch (error) {
      setMenuError(
        error instanceof Error
          ? error.message
          : "Failed to add menu item.",
      );
    } finally {
      setMenuSaving(false);
    }
  }

  function startEditingMenuItem(item: MenuItem) {
    setMenuError("");
    setEditingMenuItemId(item.id);
    setEditName(item.name);
    setEditDescription(item.description || "");
    setEditPrice(String(item.price));
  }

  function cancelEditingMenuItem() {
    setEditingMenuItemId(null);
    setEditName("");
    setEditDescription("");
    setEditPrice("");
  }

  async function saveMenuItem() {
    if (editingMenuItemId === null) {
      return;
    }

    setMenuError("");

    const name = editName.trim();
    const description = editDescription.trim();
    const price = Number(editPrice);

    if (!name) {
      setMenuError("Enter an item name.");
      return;
    }

    if (!Number.isFinite(price) || price <= 0) {
      setMenuError("Enter a valid price.");
      return;
    }

    setMenuSaving(true);

    try {
      const response = await fetch(
        "/api/restaurants/menu",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: editingMenuItemId,
            name,
            description,
            price,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to update menu item.");
      }

      cancelEditingMenuItem();
      await loadDashboard(false);
    } catch (error) {
      setMenuError(
        error instanceof Error
          ? error.message
          : "Failed to update menu item.",
      );
    } finally {
      setMenuSaving(false);
    }
  }

  async function toggleMenuItem(item: MenuItem) {
    setMenuError("");
    setMenuSaving(true);

    try {
      const response = await fetch(
        "/api/restaurants/menu",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: item.id,
            isAvailable: !item.isAvailable,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Failed to update availability.",
        );
      }

      await loadDashboard(false);
    } catch (error) {
      setMenuError(
        error instanceof Error
          ? error.message
          : "Failed to update availability.",
      );
    } finally {
      setMenuSaving(false);
    }
  }

  async function deleteMenuItem(item: MenuItem) {
    const confirmed = window.confirm(
      `Delete "${item.name}" from the menu?`,
    );

    if (!confirmed) {
      return;
    }

    setMenuError("");
    setMenuSaving(true);

    try {
      const response = await fetch(
        `/api/restaurants/menu?id=${item.id}`,
        {
          method: "DELETE",
        },
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to delete menu item.");
      }

      if (editingMenuItemId === item.id) {
        cancelEditingMenuItem();
      }

      await loadDashboard(false);
    } catch (error) {
      setMenuError(
        error instanceof Error
          ? error.message
          : "Failed to delete menu item.",
      );
    } finally {
      setMenuSaving(false);
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
            onClick={() => loadDashboard(true)}
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

  const newOrders = data.orders.filter(
    (order) => order.status === "NEW",
  );

  const activeOrders = data.orders.filter(
    (order) => ACTIVE_STATUSES.includes(order.status),
  );
  const filteredOrders = data.orders.filter((order) => {
    const query = orderSearch.trim().toLowerCase();
    const matchesSearch = !query ||
      order.orderNumber.toLowerCase().includes(query) ||
      order.customerPhone.toLowerCase().includes(query);
    return matchesSearch &&
      (orderStatusFilter === "ALL" || order.status === orderStatusFilter);
  });
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const safeOrderPage = Math.min(orderPage, pageCount - 1);
  const visibleOrders = filteredOrders.slice(safeOrderPage * pageSize, (safeOrderPage + 1) * pageSize);

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

              {data.restaurant.isOpen ? "Open" : "Closed"}
            </div>

            <button
              type="button"
              onClick={toggleRestaurantAvailability}
              disabled={availabilitySaving}
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
            >
              {availabilitySaving
                ? "Saving…"
                : data.restaurant.isOpen
                  ? "Close ordering"
                  : "Open restaurant"}
            </button>

            <button
              onClick={enableNotifications}
              className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-100"
            >
              {notificationEnabled
                ? "🔔 Alerts on"
                : "🔔 Enable alerts"}
            </button>
          </div>
        </header>
        {alertSetupMessage && (
          <p role="status" className="mt-3 text-xs text-neutral-500">
            {alertSetupMessage}
          </p>
        )}

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
                  These orders are waiting for you to accept them.
                </p>
              </div>

              <button
                onClick={() => {
                  playAlertSound();
                  document
                    .getElementById("orders")
                    ?.scrollIntoView({
                      behavior: "smooth",
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
        <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              Restaurant commission
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {formatMoney(data.feeSummary.totalPlatformFees)}
            </p>

            <p className="mt-1 text-xs text-neutral-400">
              New fee model; excludes legacy orders
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <p className="text-sm text-neutral-500">
              Delivery fees
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {formatMoney(data.feeSummary.totalDeliveryFees)}
            </p>

            <p className="mt-1 text-xs text-neutral-400">
              Actual delivery fees
            </p>
          </div>
        </section>

        {/* RECONCILIATION */}
        <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">
                Fee summary
              </h2>

              <p className="mt-1 text-sm text-neutral-500">
                Expected amounts for accepted, active and delivered orders in the selected period; payments are not verified here.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:flex sm:items-center sm:flex-wrap">
              <div>
                <p className="text-neutral-400">
                  Orders
                </p>

                <p className="font-semibold">
                  {data.feeSummary.orderCount}
                </p>
              </div>

              <div>
                <p className="text-neutral-400">
                  Food value
                </p>

                <p className="font-semibold">
                  {formatMoney(data.feeSummary.totalFoodValue)}
                </p>
              </div>

              <div>
                <p className="text-neutral-400">
                  Customer total
                </p>

                <p className="font-semibold">
                  {formatMoney(data.feeSummary.totalCustomerValue)}
                </p>
              </div>

              <div>
                <p className="text-neutral-400">
                  Customer OffMenu fees (expected)
                </p>

                <p className="font-semibold">
                  {formatMoney(
                    data.feeSummary.totalCustomerPlatformFees,
                  )}
                </p>
              </div>

              <div>
                <p className="text-neutral-400">
                  Restaurant commission
                </p>

                <p className="font-semibold">
                  {formatMoney(data.feeSummary.totalPlatformFees)}
                </p>
              </div>

              <div>
                <p className="text-neutral-400">
                  Legacy OffMenu fees
                </p>

                <p className="font-semibold">
                  {formatMoney(data.feeSummary.totalLegacyPlatformFees)}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* TABS */}
        <div className="mt-8 flex items-center gap-2 border-b border-neutral-200">
          <button
            onClick={() => setActiveTab("orders")}
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
            onClick={() => setActiveTab("menu")}
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
          <section id="orders" className="mt-6">
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
                onChange={(event) => { setRange(event.target.value); setOrderPage(0); }}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none"
              >
                <option value="hour">Last hour</option>
                <option value="3hours">Last 3 hours</option>
                <option value="6hours">Last 6 hours</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
              </select>
            </div>

            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
                <input
                  value={orderSearch}
                  onChange={(event) => { setOrderSearch(event.target.value); setOrderPage(0); }}
                  placeholder="Search order number or customer phone"
                  aria-label="Search orders"
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm"
                />
                <select
                  value={orderStatusFilter}
                  onChange={(event) => { setOrderStatusFilter(event.target.value); setOrderPage(0); }}
                  aria-label="Filter orders by status"
                  className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm"
                >
                  <option value="ALL">All statuses</option>
                  {Object.keys(STATUS_LABELS).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                </select>
              </div>
              {data.orders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
                  <p className="font-medium">
                    No orders yet
                  </p>

                  <p className="mt-1 text-sm text-neutral-500">
                    Orders from OffMenu customers will appear here.
                  </p>
                </div>
              ) : (
                visibleOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    updating={updatingOrderId === order.id}
                    onStatusChange={updateOrderStatus}
                  />
                ))
              )}
              {data.orders.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-sm">
                  <span className="text-neutral-500">{filteredOrders.length} matching orders · page {safeOrderPage + 1} of {pageCount}</span>
                  <div className="flex gap-2">
                    <button type="button" disabled={safeOrderPage === 0} onClick={() => setOrderPage(Math.max(0, safeOrderPage - 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button>
                    <button type="button" disabled={safeOrderPage + 1 >= pageCount} onClick={() => setOrderPage(Math.min(pageCount - 1, safeOrderPage + 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button>
                  </div>
                </div>
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
                Manage your menu directly from the restaurant panel.
              </p>
            </div>

            {/* ADD ITEM */}
            <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-5">
              <h3 className="font-semibold">
                Add menu item
              </h3>

              <div className="mt-4 grid gap-3 md:grid-cols-[1.2fr_1.5fr_0.7fr_auto]">
                <input
                  value={newItemName}
                  onChange={(event) => setNewItemName(event.target.value)}
                  placeholder="Item name"
                  className="rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black"
                />

                <input
                  value={newItemDescription}
                  onChange={(event) =>
                    setNewItemDescription(event.target.value)
                  }
                  placeholder="Description (optional)"
                  className="rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black"
                />

                <input
                  value={newItemPrice}
                  onChange={(event) => setNewItemPrice(event.target.value)}
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Price"
                  className="rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black"
                />

                <button
                  onClick={addMenuItem}
                  disabled={menuSaving}
                  className="rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {menuSaving ? "Saving..." : "Add item"}
                </button>
              </div>
            </div>

            {menuError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {menuError}
              </div>
            )}

            {/* MENU ITEMS */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.menu.length === 0 ? (
                <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
                  <p className="font-medium">
                    No menu items
                  </p>

                  <p className="mt-1 text-sm text-neutral-500">
                    Add your first item above.
                  </p>
                </div>
              ) : (
                data.menu.map((item) => {
                  const editing = editingMenuItemId === item.id;

                  if (editing) {
                    return (
                      <div
                        key={item.id}
                        className="rounded-2xl border-2 border-black bg-white p-4 sm:col-span-2 lg:col-span-1"
                      >
                        <p className="text-sm font-semibold">
                          Edit item
                        </p>

                        <div className="mt-4 space-y-3">
                          <input
                            value={editName}
                            onChange={(event) =>
                              setEditName(event.target.value)
                            }
                            placeholder="Item name"
                            className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black"
                          />

                          <textarea
                            value={editDescription}
                            onChange={(event) =>
                              setEditDescription(event.target.value)
                            }
                            placeholder="Description"
                            rows={3}
                            className="w-full resize-none rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black"
                          />

                          <input
                            value={editPrice}
                            onChange={(event) =>
                              setEditPrice(event.target.value)
                            }
                            type="number"
                            min="1"
                            step="1"
                            placeholder="Price"
                            className="w-full rounded-xl border border-neutral-300 px-4 py-3 text-sm outline-none focus:border-black"
                          />

                          <div className="flex gap-2">
                            <button
                              onClick={saveMenuItem}
                              disabled={menuSaving}
                              className="flex-1 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                            >
                              Save
                            </button>

                            <button
                              onClick={cancelEditingMenuItem}
                              disabled={menuSaving}
                              className="rounded-xl border border-neutral-300 bg-white px-4 py-3 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
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
                          {formatMoney(item.price)}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${
                            item.isAvailable
                              ? "border-green-200 bg-green-50 text-green-700"
                              : "border-red-200 bg-red-50 text-red-700"
                          }`}
                        >
                          {item.isAvailable ? "Available" : "Unavailable"}
                        </span>

                        <button
                          onClick={() => toggleMenuItem(item)}
                          disabled={menuSaving}
                          className="text-sm font-medium underline underline-offset-2 disabled:opacity-50"
                        >
                          {item.isAvailable
                            ? "Mark unavailable"
                            : "Mark available"}
                        </button>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => startEditingMenuItem(item)}
                          disabled={menuSaving}
                          className="flex-1 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50"
                        >
                          Edit
                        </button>

                        <button
                          onClick={() => deleteMenuItem(item)}
                          disabled={menuSaving}
                          className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
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
  onStatusChange,
}: {
  order: Order;
  updating: boolean;
  onStatusChange: (
    orderId: number,
    status: string,
  ) => void;
}) {
  const nextAction =
    order.status === "NEW"
      ? {
          label: "Accept Order",
          status: "ACCEPTED",
          className: "bg-green-600 hover:bg-green-700",
        }
      : order.status === "ACCEPTED"
        ? {
            label: "Start Preparing",
            status: "PREPARING",
            className: "bg-black hover:bg-neutral-800",
          }
        : order.status === "PREPARING"
          ? {
              label: "Out for Delivery",
              status: "OUT_FOR_DELIVERY",
              className: "bg-black hover:bg-neutral-800",
            }
          : order.status === "OUT_FOR_DELIVERY"
            ? {
                label: "Mark Delivered",
                status: "DELIVERED",
                className: "bg-green-600 hover:bg-green-700",
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
                {order.orderNumber}
              </h3>

              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  STATUS_CLASSES[order.status] ||
                  "border-neutral-200 bg-neutral-100 text-neutral-600"
                }`}
              >
                {STATUS_LABELS[order.status] || order.status}
              </span>
            </div>

            <p className="mt-1 text-sm text-neutral-500">
              {formatDate(order.createdAt)} at {formatTime(order.createdAt)}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <p className="text-xl font-semibold">
              {formatMoney(order.total)}
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
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {item.quantity} × {item.itemName}
                  </p>

                  {item.note && (
                    <p className="mt-1 text-xs text-neutral-500">
                      Note: {item.note}
                    </p>
                  )}
                </div>

                <p className="whitespace-nowrap text-sm font-medium">
                  {formatMoney(item.total)}
                </p>
              </div>
            ))}
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
            {order.customerName || "Customer"}
          </p>

          <p className="mt-1 text-sm text-neutral-500">
            {order.customerPhone}
          </p>

          <div className="mt-5 border-t border-neutral-200 pt-4">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">
                Food
              </span>

              <span className="font-medium">
                {formatMoney(order.subtotal)}
              </span>
            </div>

            <div className="mt-2 flex justify-between text-sm">
              <span className="text-neutral-500">
                Delivery fee
              </span>

              <span className="font-medium">
                {order.deliveryFee > 0
                  ? formatMoney(order.deliveryFee)
                  : "₹0"}
              </span>
            </div>

            <div className="mt-2 flex justify-between text-xs text-neutral-500">
              <span>
                Customer OffMenu fee (expected)
              </span>

              <span>
                {formatMoney(order.customerPlatformFee)}
              </span>
            </div>

            <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3 text-sm font-semibold">
              <span>
                Customer total
              </span>

              <span>
                {formatMoney(order.total)}
              </span>
            </div>

            <div className="mt-2 flex justify-between text-xs text-neutral-400">
              <span>
                {order.feeModel === "LEGACY"
                  ? "Legacy OffMenu fee"
                  : "Restaurant commission"}
              </span>

              <span>
                {formatMoney(order.platformFee)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {(nextAction || order.status === "NEW") && (
        <div className="flex flex-col gap-3 border-t border-neutral-200 bg-neutral-50 p-4 sm:flex-row sm:justify-end">
          {order.status === "NEW" && (
            <button
              onClick={() =>
                onStatusChange(order.id, "CANCELLED")
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
                onStatusChange(order.id, nextAction.status)
              }
              disabled={updating}
              className={`rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-50 ${nextAction.className}`}
            >
              {updating ? "Updating..." : nextAction.label}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
