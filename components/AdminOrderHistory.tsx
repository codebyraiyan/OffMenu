"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/utils";

type AdminOrder = {
  id: number;
  orderNumber: string;
  restaurantId: number;
  customerPhone: string;
  subtotal: number;
  customerPlatformFee: number;
  deliveryFee: number;
  platformFee: number;
  feeModel: string;
  total: number;
  status: string;
  createdAt: Date | string;
};

export default function AdminOrderHistory({ orders }: { orders: AdminOrder[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesQuery = !normalized ||
        order.orderNumber.toLowerCase().includes(normalized) ||
        order.customerPhone.toLowerCase().includes(normalized) ||
        String(order.restaurantId).includes(normalized);
      return matchesQuery && (status === "ALL" || order.status === status);
    });
  }, [orders, query, status]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice(page * pageSize, (page + 1) * pageSize);

  function changeQuery(value: string) { setQuery(value); setPage(0); }
  function changeStatus(value: string) { setStatus(value); setPage(0); }

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="grid gap-3 border-b border-neutral-200 p-4 sm:grid-cols-[1fr_220px]">
        <input
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
          placeholder="Search order number, phone, or restaurant ID"
          aria-label="Search all orders"
          className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm"
        />
        <select value={status} onChange={(event) => changeStatus(event.target.value)} aria-label="Filter by order status" className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm">
          <option value="ALL">All statuses</option>
          { ["NEW", "ACCEPTED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"].map((value) => <option key={value} value={value}>{value.replace(/_/g, " ")}</option>)}
        </select>
      </div>
      {visible.length === 0 ? (
        <div className="p-8 text-sm text-neutral-500">{orders.length ? "No orders match these filters." : "No orders yet."}</div>
      ) : (
        <div className="divide-y divide-neutral-200">
          {visible.map((order) => (
            <article key={order.id} className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
              <div><p className="text-xs text-neutral-400">ORDER · RESTAURANT #{order.restaurantId}</p><p className="mt-1 font-medium">{order.orderNumber}</p><p className="mt-1 text-xs text-neutral-500">{new Date(order.createdAt).toLocaleString("en-IN")}</p></div>
              <div><p className="text-xs text-neutral-400">CUSTOMER</p><p className="mt-1 text-sm">{order.customerPhone}</p><p className="mt-1 text-sm font-medium">{order.status}</p></div>
              <div className="text-sm"><p>Food {money(order.subtotal)}</p><p>Customer fee {money(order.customerPlatformFee)}</p><p>Delivery {money(order.deliveryFee)}</p><p className="font-semibold">Customer total {money(order.total)}</p></div>
              <div className="text-sm"><p>{order.feeModel === "LEGACY" ? "Legacy OffMenu fee" : "Restaurant commission"}</p><p className="font-semibold">{money(order.platformFee)}</p></div>
            </article>
          ))}
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 p-4 text-sm">
        <span className="text-neutral-500">{filtered.length} orders · page {page + 1} of {pageCount}</span>
        <div className="flex gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button>
          <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button>
        </div>
      </footer>
    </section>
  );
}
