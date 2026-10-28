"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type RestaurantSummary = {
  id: number;
  name: string;
  isActive: boolean;
  summary: {
    eligibleOrderCount: number;
    commissionOwed: number;
    commissionReceived: number;
    outstandingBalance: number;
    overpaymentCredit: number;
    legacyPlatformFees: number;
    customerPlatformFees: number;
  };
};

type Settlement = {
  id: number;
  restaurantId: number;
  amount: number;
  paidAt: number | string | Date;
  paymentReference: string | null;
  notes: string | null;
  periodStart: number | string | Date | null;
  periodEnd: number | string | Date | null;
};

type CommissionData = { restaurants: RestaurantSummary[]; settlements: Settlement[] };

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function dateInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function CommissionsPage() {
  const [data, setData] = useState<CommissionData | null>(null);
  const [restaurantId, setRestaurantId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(dateInputValue());
  const [paymentReference, setPaymentReference] = useState("");
  const [notes, setNotes] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const idempotencyKey = useRef<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/commissions", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load commission data.");
      setData(result);
      if (!restaurantId && result.restaurants[0]) {
        setRestaurantId(String(result.restaurants[0].id));
      }
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load commission data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId,
          amount,
          paidAt,
          paymentReference,
          notes,
          periodStart: periodStart || null,
          periodEnd: periodEnd || null,
          idempotencyKey: idempotencyKey.current ??= crypto.randomUUID(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to record payment.");
      setAmount("");
      setPaymentReference("");
      setNotes("");
      idempotencyKey.current = null;
      setPeriodStart("");
      setPeriodEnd("");
      setMessage("Commission payment recorded.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record payment.");
    } finally {
      setSaving(false);
    }
  }

  const selected = data?.restaurants.find((item) => String(item.id) === restaurantId);
  const names = new Map(data?.restaurants.map((item) => [item.id, item.name]) ?? []);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-neutral-500">OFFMENU ADMIN</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Commission settlements</h1>
        <p className="mt-2 text-sm text-neutral-500">
          New-model commissions exclude cancelled and legacy-model orders. Legacy fees remain visible separately pending reconciliation.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-700">{message}</p>}
      {loading && <p className="text-sm text-neutral-500">Loading settlements…</p>}

      {data && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.restaurants.map((restaurant) => (
              <article key={restaurant.id} className="rounded-2xl border border-neutral-200 bg-white p-5">
                <h2 className="font-semibold">{restaurant.name}</h2>
                <p className="mt-1 text-xs text-neutral-500">{restaurant.summary.eligibleOrderCount} eligible orders</p>
                <dl className="mt-5 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt>Commission owed</dt><dd className="font-medium">{money(restaurant.summary.commissionOwed)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Payments received</dt><dd>{money(restaurant.summary.commissionReceived)}</dd></div>
                  <div className="flex justify-between gap-3 border-t pt-2 font-semibold"><dt>Outstanding</dt><dd>{money(restaurant.summary.outstandingBalance)}</dd></div>
                  {restaurant.summary.overpaymentCredit > 0 && <div className="flex justify-between gap-3"><dt>Overpayment credit</dt><dd>{money(restaurant.summary.overpaymentCredit)}</dd></div>}
                  <div className="flex justify-between gap-3 text-neutral-500"><dt>Legacy fees (not settled here)</dt><dd>{money(restaurant.summary.legacyPlatformFees)}</dd></div>
                  <div className="flex justify-between gap-3 text-neutral-500"><dt>Customer OffMenu fees</dt><dd>{money(restaurant.summary.customerPlatformFees)}</dd></div>
                </dl>
              </article>
            ))}
          </section>

          <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <form onSubmit={recordPayment} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Record commission payment</h2>
              <label className="block text-sm font-medium">Restaurant
                <select required value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3">
                  {data.restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Amount (₹)
                  <input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3" />
                </label>
                <label className="block text-sm font-medium">Payment date
                  <input required type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3" />
                </label>
              </div>
              <label className="block text-sm font-medium">Payment reference
                <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Period start (optional)
                  <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3" />
                </label>
                <label className="block text-sm font-medium">Period end (optional)
                  <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3" />
                </label>
              </div>
              <label className="block text-sm font-medium">Notes (optional)
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3" />
              </label>
              <button disabled={saving || data.restaurants.length === 0} className="rounded-xl bg-black px-5 py-3 text-sm font-medium text-white disabled:opacity-50">
                {saving ? "Recording…" : "Record payment"}
              </button>
            </form>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5">
              <h2 className="text-lg font-semibold">Payment history</h2>
              {data.settlements.length === 0 ? <p className="mt-4 text-sm text-neutral-500">No commission payments recorded.</p> : (
                <div className="mt-4 space-y-3">
                  {data.settlements.map((payment) => (
                    <article key={payment.id} className="rounded-xl border border-neutral-200 p-4 text-sm">
                      <div className="flex flex-wrap justify-between gap-2"><strong>{names.get(payment.restaurantId) ?? `Restaurant ${payment.restaurantId}`}</strong><strong>{money(payment.amount)}</strong></div>
                      <p className="mt-1 text-neutral-500">Paid {new Date(payment.paidAt).toLocaleDateString("en-IN")}{payment.paymentReference ? ` · Ref ${payment.paymentReference}` : ""}</p>
                      {(payment.periodStart || payment.periodEnd) && <p className="mt-1 text-neutral-500">Period: {payment.periodStart ? new Date(payment.periodStart).toLocaleDateString("en-IN") : "—"} to {payment.periodEnd ? new Date(payment.periodEnd).toLocaleDateString("en-IN") : "—"}</p>}
                      {payment.notes && <p className="mt-2 whitespace-pre-wrap">{payment.notes}</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
          {selected && <p className="text-xs text-neutral-400">Settlement entries are retained as an append-only audit history. Overpayments remain visible as credit.</p>}
        </>
      )}
    </div>
  );
}
