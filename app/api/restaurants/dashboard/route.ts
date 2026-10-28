import { NextResponse } from "next/server";

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
} from "drizzle-orm";

import { db } from "@/db";

import {
  restaurants,
  menuItems,
  orders,
  orderItems,
} from "@/db/schema";

import { getRestaurantSession } from "@/lib/auth";
import { calculateCommissionSummary } from "@/lib/commission";
import { fromPaise } from "@/lib/fees";

export async function GET(request: Request) {
  const session = await getRestaurantSession();

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      },
    );
  }

  const restaurantId = session.restaurantId;

  const url = new URL(request.url);

  const range = url.searchParams.get("range") || "today";

  const restaurantRows = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);

  const restaurant = restaurantRows[0];

  if (!restaurant) {
    return NextResponse.json(
      {
        error: "Restaurant not found.",
      },
      {
        status: 404,
      },
    );
  }

  const menu = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, restaurantId))
    .orderBy(menuItems.id);

  const now = new Date();
  const startDate = new Date(now);
  let endDate: Date | null = null;

  if (range === "hour") {
    startDate.setHours(startDate.getHours() - 1);
  } else if (range === "3hours") {
    startDate.setHours(startDate.getHours() - 3);
  } else if (range === "6hours") {
    startDate.setHours(startDate.getHours() - 6);
  } else if (range === "yesterday") {
    startDate.setDate(startDate.getDate() - 1);
    startDate.setHours(0, 0, 0, 0);
    endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
  } else {
    startDate.setHours(0, 0, 0, 0);
  }

  const orderConditions = [
    eq(orders.restaurantId, restaurantId),
    gte(orders.createdAt, startDate),
  ];
  if (endDate) {
    orderConditions.push(lt(orders.createdAt, endDate));
  }

  const orderRows = await db
    .select()
    .from(orders)
    .where(and(...orderConditions))
    .orderBy(desc(orders.createdAt));

  const orderIds = orderRows.map((order) => order.id);

  const items =
    orderIds.length > 0
      ? await db
          .select()
          .from(orderItems)
          .where(inArray(orderItems.orderId, orderIds))
      : [];

  const ordersWithItems = orderRows.map((order) => ({
    ...order,
    items: items.filter((item) => item.orderId === order.id),
  }));

  /*
   * Only accepted, active, and delivered orders count
   * toward reconciliation.
   *
   * NEW orders have not been accepted yet.
   * CANCELLED orders do not generate fees.
   */
  const summary = calculateCommissionSummary(orderRows, 0);

  return NextResponse.json({
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      isOpen: restaurant.isOpen,
    },

    menu,

    orders: ordersWithItems,

    feeSummary: {
      orderCount: summary.orderCount,
      totalFoodValue: fromPaise(summary.subtotalPaise),
      totalDeliveryFees: fromPaise(summary.deliveryFeesPaise),
      totalPlatformFees: fromPaise(summary.commissionOwedPaise),
      totalCustomerPlatformFees: fromPaise(
        summary.customerPlatformFeesPaise,
      ),
      totalLegacyPlatformFees: fromPaise(
        summary.legacyPlatformFeesPaise,
      ),
      totalCustomerValue: fromPaise(summary.customerTotalPaise),
    },
  });
}
