import { NextResponse } from "next/server";

import {
  and,
  eq
} from "drizzle-orm";

import { db, withDatabaseTransaction } from "@/db";

import {
  orders,
  restaurants
} from "@/db/schema";

import {
  getRestaurantSession
} from "@/lib/auth";
import { enqueueWhatsappMessage } from "@/lib/whatsapp-outbox";
import type { WhatsappPayload } from "@/lib/whatsapp-outbox";
import { transitionAndEnqueueNotification } from "@/lib/order-notifications";

async function transitionOrder(
  orderId: number,
  restaurantId: number,
  oldStatus: string,
  newStatus: string,
  notification?: { key: string; recipient: string; payload: WhatsappPayload },
) {
  return withDatabaseTransaction(async () => {
    return transitionAndEnqueueNotification(
      async () => {
        const updated = await db
          .update(orders)
          .set({ status: newStatus })
          .where(and(
            eq(orders.id, orderId),
            eq(orders.restaurantId, restaurantId),
            eq(orders.status, oldStatus),
          ))
          .returning({ id: orders.id });
        return updated.length > 0;
      },
      async () => {
        if (notification) {
          await enqueueWhatsappMessage(
            notification.key,
            notification.recipient,
            notification.payload,
          );
        }
      },
    );
  });
}

export async function POST(
  request: Request
) {
  try {
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

    const body =
      await request.json();

    const orderId =
      Number(body.orderId);

    const newStatus =
      String(
        body.status || ""
      ).trim();

    if (
      !Number.isInteger(orderId) ||
      orderId <= 0
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid order ID."
        },
        {
          status: 400
        }
      );
    }

    const allowedStatuses = [
      "ACCEPTED",
      "PREPARING",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED"
    ];

    if (
      !allowedStatuses.includes(
        newStatus
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid order status."
        },
        {
          status: 400
        }
      );
    }

    const rows =
      await db
        .select()
        .from(orders)
        .where(
          and(
            eq(
              orders.id,
              orderId
            ),
            eq(
              orders.restaurantId,
              session.restaurantId
            )
          )
        )
        .limit(1);

    const order =
      rows[0];

    if (!order) {
      return NextResponse.json(
        {
          error:
            "Order not found."
        },
        {
          status: 404
        }
      );
    }

    /*
     * Valid status transitions.
     *
     * NEW
     *   -> ACCEPTED
     *   -> CANCELLED
     *
     * ACCEPTED
     *   -> PREPARING
     *   -> CANCELLED
     *
     * PREPARING
     *   -> OUT_FOR_DELIVERY
     *   -> CANCELLED
     *
     * OUT_FOR_DELIVERY
     *   -> DELIVERED
     */
    const validTransitions: Record<
      string,
      string[]
    > = {
      NEW: [
        "ACCEPTED",
        "CANCELLED"
      ],

      ACCEPTED: [
        "PREPARING",
        "CANCELLED"
      ],

      PREPARING: [
        "OUT_FOR_DELIVERY",
        "CANCELLED"
      ],

      OUT_FOR_DELIVERY: [
        "DELIVERED"
      ],

      DELIVERED: [],

      CANCELLED: []
    };

    const possibleTransitions =
      validTransitions[
        order.status
      ] || [];

    if (
      !possibleTransitions.includes(
        newStatus
      )
    ) {
      return NextResponse.json(
        {
          error:
            `Cannot change order from ${order.status} to ${newStatus}.`
        },
        {
          status: 400
        }
      );
    }

    /*
     * Only one request can successfully
     * transition a NEW order to ACCEPTED.
     *
     * This prevents two restaurant staff
     * devices from accepting the same order
     * and sending two confirmations.
     */
    if (
      order.status === "NEW" &&
      newStatus === "ACCEPTED"
    ) {
      const restaurantRows =
        await db
          .select()
          .from(restaurants)
          .where(
            eq(
              restaurants.id,
              session.restaurantId
            )
          )
          .limit(1);

      const restaurant =
        restaurantRows[0];

      if (!restaurant) {
        const updated = await transitionOrder(
          orderId,
          session.restaurantId,
          "NEW",
          "ACCEPTED",
        );
        if (!updated) {
          return NextResponse.json({ error: "This order has already been updated." }, { status: 409 });
        }
        return NextResponse.json({ success: true, status: "ACCEPTED", notificationQueued: false });
      }

      /*
       * Customer confirmation is sent ONLY
       * after the restaurant accepts.
       */
      const confirmationMessage =
        [
          "✅ *ORDER CONFIRMED*",
          "",
          `Order: *#${order.orderNumber}*`,
          `Restaurant: *${restaurant.name}*`,
          "",
          "The restaurant has accepted your order and is preparing it.",
          "",
          `📞 Contact: ${restaurant.phone}`,
          "",
          "You'll receive another update when your order is out for delivery.",
          "",
          "Thank you for ordering with *OffMenu* ❤️"
        ].join("\n");

      const updated = await transitionOrder(
        orderId,
        session.restaurantId,
        "NEW",
        "ACCEPTED",
        {
          key: `order:${order.id}:accepted`,
          recipient: order.customerPhone,
          payload: { type: "text", text: { body: confirmationMessage } },
        },
      );
      if (!updated) {
        return NextResponse.json({ error: "This order has already been updated." }, { status: 409 });
      }

      return NextResponse.json({
        success: true,
        status: "ACCEPTED",
        notificationQueued: true,
      });
    }

    let notification: { key: string; recipient: string; payload: WhatsappPayload } | undefined;
    let warning: string | undefined;

    if (newStatus === "OUT_FOR_DELIVERY") {
      const restaurantRows = await db.select().from(restaurants)
        .where(eq(restaurants.id, session.restaurantId)).limit(1);
      const restaurant = restaurantRows[0];
      if (!restaurant) {
        warning = "Order marked out for delivery, but restaurant information could not be loaded.";
      } else {
        const body = [
          "🛵 *ORDER OUT FOR DELIVERY*", "", `Order: *#${order.orderNumber}*`,
          `Restaurant: *${restaurant.name}*`, "", "Your order is on the way! 🛵", "",
          "Please keep your phone available and be ready to receive your order.", "",
          "Thank you for ordering with *OffMenu* ❤️",
        ].join("\n");
        notification = {
          key: `order:${order.id}:out-for-delivery`,
          recipient: order.customerPhone,
          payload: { type: "text", text: { body } },
        };
      }
    } else if (newStatus === "DELIVERED") {
      const body = [
        "✅ *ORDER DELIVERED*", "", `Order: *#${order.orderNumber}*`, "",
        "Your restaurant marked this order as delivered.",
        "Thank you for ordering with *OffMenu*.",
      ].join("\n");
      notification = {
        key: `order:${order.id}:delivered`,
        recipient: order.customerPhone,
        payload: { type: "text", text: { body } },
      };
    }

    const updated = await transitionOrder(
      orderId,
      session.restaurantId,
      order.status,
      newStatus,
      notification,
    );
    if (!updated) {
      return NextResponse.json({ error: "This order has already been updated." }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
      ...(notification ? { notificationQueued: true } : {}),
      ...(warning ? { warning } : {}),
    });

  } catch (error) {
    console.error(
      "Restaurant order status error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong while updating the order."
      },
      {
        status: 500
      }
    );
  }
}
