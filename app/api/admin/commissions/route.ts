import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { commissionSettlements, orders, restaurants } from "@/db/schema";
import { calculateCommissionSummary } from "@/lib/commission";
import { addPaise, fromPaise } from "@/lib/fees";
import { isAdmin } from "@/lib/auth";

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

function parseMoneyToPaise(value: unknown) {
  const text = String(value ?? "").trim();
  if (!MONEY_PATTERN.test(text)) return null;
  const [rupees, fraction = ""] = text.split(".");
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

function parseDate(value: unknown, optional = false) {
  if (optional && (value === undefined || value === null || value === "")) {
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? undefined
    : date;
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [restaurantRows, orderRows, paymentRows] = await Promise.all([
    db.select().from(restaurants).orderBy(restaurants.name),
    db.select().from(orders),
    db.select().from(commissionSettlements).orderBy(desc(commissionSettlements.paidAt)),
  ]);

  const paymentsByRestaurant = new Map<number, number>();
  for (const payment of paymentRows) {
    paymentsByRestaurant.set(
      payment.restaurantId,
      addPaise(paymentsByRestaurant.get(payment.restaurantId) ?? 0, payment.amountPaise),
    );
  }

  const result = restaurantRows.map((restaurant) => {
    const restaurantOrders = orderRows.filter(
      (order) => order.restaurantId === restaurant.id,
    );
    const summary = calculateCommissionSummary(
      restaurantOrders,
      paymentsByRestaurant.get(restaurant.id) ?? 0,
    );

    return {
      id: restaurant.id,
      name: restaurant.name,
      isActive: restaurant.isActive,
      summary: {
        eligibleOrderCount: summary.orderCount,
        commissionOwed: fromPaise(summary.commissionOwedPaise),
        commissionReceived: fromPaise(summary.commissionReceivedPaise),
        outstandingBalance: fromPaise(summary.commissionOutstandingPaise),
        overpaymentCredit: fromPaise(summary.commissionOverpaymentPaise),
        legacyPlatformFees: fromPaise(summary.legacyPlatformFeesPaise),
        customerPlatformFees: fromPaise(summary.customerPlatformFeesPaise),
      },
    };
  });

  return NextResponse.json({
    restaurants: result,
    settlements: paymentRows.map((payment) => ({
      ...payment,
      amount: fromPaise(payment.amountPaise),
    })),
  });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid settlement details." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const restaurantId = Number(input.restaurantId);
  const amountPaise = parseMoneyToPaise(input.amount);
  const paidAt = parseDate(input.paidAt);
  const periodStart = parseDate(input.periodStart, true);
  const periodEnd = parseDate(input.periodEnd, true);
  const idempotencyKey = String(input.idempotencyKey ?? "").trim();
  const paymentReference = String(input.paymentReference ?? "").trim().toUpperCase() || null;
  const notes = String(input.notes ?? "").trim() || null;

  if (!Number.isSafeInteger(restaurantId) || restaurantId <= 0) {
    return NextResponse.json({ error: "Select a valid restaurant." }, { status: 400 });
  }
  if (amountPaise === null) {
    return NextResponse.json({ error: "Enter a positive amount with at most two decimal places." }, { status: 400 });
  }
  if (!paidAt || periodStart === undefined || periodEnd === undefined) {
    return NextResponse.json({ error: "Enter valid payment and settlement dates." }, { status: 400 });
  }
  if (periodStart && periodEnd && periodStart > periodEnd) {
    return NextResponse.json({ error: "Settlement period start must precede its end." }, { status: 400 });
  }
  if (!idempotencyKey || idempotencyKey.length > 100) {
    return NextResponse.json({ error: "A valid submission key is required." }, { status: 400 });
  }
  if (!paymentReference) {
    return NextResponse.json({ error: "A payment reference is required to prevent duplicate recording." }, { status: 400 });
  }
  if (paymentReference.length > 120) {
    return NextResponse.json({ error: "Payment reference is too long." }, { status: 400 });
  }
  if (notes && notes.length > 1000) {
    return NextResponse.json({ error: "Notes must be 1000 characters or fewer." }, { status: 400 });
  }

  const [restaurant] = await db
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);
  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found." }, { status: 404 });
  }

  try {
    const [settlement] = await db
      .insert(commissionSettlements)
      .values({
        restaurantId,
        amountPaise,
        paidAt,
        paymentReference,
        notes,
        periodStart,
        periodEnd,
        idempotencyKey,
      })
      .returning();

    return NextResponse.json({ success: true, settlement }, { status: 201 });
  } catch (error) {
    if (/unique|constraint/i.test(String(error))) {
      return NextResponse.json(
        { error: "This payment reference or submission was already recorded." },
        { status: 409 },
      );
    }
    console.error("Commission settlement insert failed:", error);
    return NextResponse.json({ error: "Unable to record payment." }, { status: 500 });
  }
}
