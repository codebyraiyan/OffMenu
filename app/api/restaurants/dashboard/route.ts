import { NextResponse } from "next/server";
import {
  and,
  desc,
  eq,
  gte,
  inArray
} from "drizzle-orm";

import { db } from "@/db";
import {
  restaurants,
  menuItems,
  orders,
  orderItems
} from "@/db/schema";

import {
  getRestaurantSession
} from "@/lib/auth";

export async function GET(
  request: Request
) {
  const session =
    await getRestaurantSession();

  if (!session) {
    return NextResponse.json(
      {
        error: "Unauthorized"
      },
      {
        status: 401
      }
    );
  }

  const restaurantId =
    session.restaurantId;

  const url =
    new URL(request.url);

  const range =
    url.searchParams.get(
      "range"
    ) || "today";

  const restaurantRows =
    await db
      .select()
      .from(restaurants)
      .where(
        eq(
          restaurants.id,
          restaurantId
        )
      )
      .limit(1);

  const restaurant =
    restaurantRows[0];

  if (!restaurant) {
    return NextResponse.json(
      {
        error:
          "Restaurant not found."
      },
      {
        status: 404
      }
    );
  }

  const menu =
    await db
      .select()
      .from(menuItems)
      .where(
        eq(
          menuItems.restaurantId,
          restaurantId
        )
      )
      .orderBy(
        menuItems.id
      );

  const now =
    new Date();

  let startDate =
    new Date(
      now
    );

  if (range === "hour") {
    startDate.setHours(
      startDate.getHours() - 1
    );
  } else if (
    range === "3hours"
  ) {
    startDate.setHours(
      startDate.getHours() - 3
    );
  } else if (
    range === "6hours"
  ) {
    startDate.setHours(
      startDate.getHours() - 6
    );
  } else if (
    range === "yesterday"
  ) {
    startDate.setDate(
      startDate.getDate() - 1
    );

    startDate.setHours(
      0,
      0,
      0,
      0
    );
  } else {
    startDate.setHours(
      0,
      0,
      0,
      0
    );
  }

  const orderRows =
    await db
      .select()
      .from(orders)
      .where(
        and(
          eq(
            orders.restaurantId,
            restaurantId
          ),
          gte(
            orders.createdAt,
            startDate
          )
        )
      )
      .orderBy(
        desc(
          orders.createdAt
        )
      );

  const orderIds =
    orderRows.map(
      (order) =>
        order.id
    );

  const items =
    orderIds.length > 0
      ? await db
          .select()
          .from(orderItems)
          .where(
            inArray(
              orderItems.orderId,
              orderIds
            )
          )
      : [];

  const ordersWithItems =
    orderRows.map(
      (order) => ({
        ...order,
        items:
          items.filter(
            (item) =>
              item.orderId ===
              order.id
          )
      })
    );

  const billableOrders =
    orderRows.filter(
      (order) =>
        order.status !==
        "CANCELLED"
    );

  const totalFees =
    billableOrders.reduce(
      (sum, order) =>
        sum +
        order.platformFee,
      0
    );

  return NextResponse.json({
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      isOpen: restaurant.isOpen
    },
    menu,
    orders:
      ordersWithItems,
    feeSummary: {
      orderCount:
        billableOrders.length,
      totalFees
    }
  });
}