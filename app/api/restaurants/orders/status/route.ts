import { NextResponse } from "next/server";

import {
  and,
  eq
} from "drizzle-orm";

import { db } from "@/db";

import {
  orders,
  restaurants
} from "@/db/schema";

import {
  getRestaurantSession
} from "@/lib/auth";

import {
  sendText
} from "@/lib/whatsapp";

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
      const updated =
        await db
          .update(orders)
          .set({
            status:
              "ACCEPTED"
          })
          .where(
            and(
              eq(
                orders.id,
                orderId
              ),
              eq(
                orders.restaurantId,
                session.restaurantId
              ),
              eq(
                orders.status,
                "NEW"
              )
            )
          )
          .returning({
            id: orders.id
          });

      if (
        updated.length === 0
      ) {
        return NextResponse.json(
          {
            error:
              "This order has already been updated."
          },
          {
            status: 409
          }
        );
      }

      /*
       * Fetch restaurant information
       * for the customer confirmation.
       */
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
        return NextResponse.json({
          success: true,
          status: "ACCEPTED",
          warning:
            "Order accepted, but restaurant information could not be loaded."
        });
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

      try {
        await sendText(
          order.customerPhone,
          confirmationMessage
        );
      } catch {
        /*
         * The order is still ACCEPTED even if
         * WhatsApp delivery fails.
         *
         * We don't roll back the acceptance because
         * the restaurant has already accepted the order.
         */
        return NextResponse.json({
          success: true,
          status: "ACCEPTED",
          warning:
            "Order accepted, but WhatsApp confirmation could not be sent."
        });
      }

      return NextResponse.json({
        success: true,
        status: "ACCEPTED"
      });
    }

    /*
     * All other status transitions update the
     * order normally.
     */
    await db
      .update(orders)
      .set({
        status: newStatus
      })
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
      );

    /*
     * When the restaurant marks the order
     * OUT_FOR_DELIVERY, immediately notify
     * the customer on WhatsApp.
     *
     * The database status is updated first.
     * If WhatsApp fails, the order remains
     * OUT_FOR_DELIVERY and we return a warning.
     */
    if (
      newStatus ===
      "OUT_FOR_DELIVERY"
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
        return NextResponse.json({
          success: true,
          status: "OUT_FOR_DELIVERY",
          warning:
            "Order marked out for delivery, but restaurant information could not be loaded."
        });
      }

      const outForDeliveryMessage =
        [
          "🛵 *ORDER OUT FOR DELIVERY*",
          "",
          `Order: *#${order.orderNumber}*`,
          `Restaurant: *${restaurant.name}*`,
          "",
          "Your order is on the way! 🛵",
          "",
          "Please keep your phone available and be ready to receive your order.",
          "",
          "Thank you for ordering with *OffMenu* ❤️"
        ].join("\n");

      try {
        await sendText(
          order.customerPhone,
          outForDeliveryMessage
        );
      } catch {
        /*
         * The order is already marked
         * OUT_FOR_DELIVERY, so we do not
         * roll back the status if WhatsApp
         * delivery fails.
         */
        return NextResponse.json({
          success: true,
          status: "OUT_FOR_DELIVERY",
          warning:
            "Order marked out for delivery, but WhatsApp notification could not be sent."
        });
      }
    }

    return NextResponse.json({
      success: true,
      status: newStatus
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