import "dotenv/config";

import { eq, desc } from "drizzle-orm";

import { db } from "../db";
import { menuItems, orders, orderItems, restaurants } from "../db/schema";

const BASE_URL = "http://localhost:3000/api/whatsapp";

// Fake customer phone number.
// This is NOT a real WhatsApp request.
const PHONE = "919000000001";

type MetaPayload = {
  entry: Array<{
    changes: Array<{
      value: {
        messages?: Array<{
          from: string;
          type: string;
          text?: {
            body: string;
          };
          interactive?: {
            type: string;
            list_reply?: {
              id: string;
              title: string;
            };
            button_reply?: {
              id: string;
              title: string;
            };
          };
        }>;
      };
    }>;
  }>;
};

function textPayload(body: string): MetaPayload {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: PHONE,
                  type: "text",
                  text: {
                    body
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function listReplyPayload(id: string, title: string): MetaPayload {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: PHONE,
                  type: "interactive",
                  interactive: {
                    type: "list_reply",
                    list_reply: {
                      id,
                      title
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

function buttonReplyPayload(id: string, title: string): MetaPayload {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: PHONE,
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: {
                      id,
                      title
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
}

async function send(label: string, payload: MetaPayload) {
  console.log(`\n========== ${label} ==========`);

  const response = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();

  console.log(`HTTP ${response.status}`);
  console.log(text);

  if (!response.ok) {
    throw new Error(`Webhook request failed during: ${label}`);
  }

  return JSON.parse(text);
}

async function main() {
  console.log("\nOFFMENU WHATSAPP LOCAL TEST");
  console.log("============================");

  console.log("\nChecking database...");

  const availableRestaurants = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.isOpen, true))
    .limit(10);

  if (availableRestaurants.length === 0) {
    throw new Error(
      "No open restaurants found. Add a restaurant from /admin/restaurants first."
    );
  }

  const restaurant = availableRestaurants[0];

  console.log(`Restaurant: ${restaurant.name}`);
  console.log(`Restaurant ID: ${restaurant.id}`);

  const availableItems = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.restaurantId, restaurant.id))
    .limit(10);

  const usableItems = availableItems.filter((item) => item.isAvailable);

  if (usableItems.length === 0) {
    throw new Error(
      `Restaurant "${restaurant.name}" has no available menu items. Add one from the restaurant admin page first.`
    );
  }

  const item = usableItems[0];

  console.log(`Menu item: ${item.name}`);
  console.log(`Menu item ID: ${item.id}`);
  console.log(`Price: ₹${item.price}`);

  /*
   * 1. Start conversation
   */
  await send(
    "1. HI",
    textPayload("hi")
  );

  /*
   * 2. Select restaurant
   */
  await send(
    "2. SELECT RESTAURANT",
    listReplyPayload(
      `restaurant_${restaurant.id}`,
      restaurant.name
    )
  );

  /*
   * 3. Select menu item
   */
  await send(
    "3. SELECT MENU ITEM",
    listReplyPayload(
      `item_${item.id}`,
      item.name
    )
  );

  /*
   * 4. Checkout
   */
  await send(
    "4. CHECKOUT",
    buttonReplyPayload(
      "checkout",
      "Checkout"
    )
  );

  /*
   * 5. Skip customer note
   */
  await send(
    "5. SKIP NOTE",
    textPayload("skip")
  );

  /*
   * 6. Delivery address
   */
  await send(
    "6. DELIVERY ADDRESS",
    textPayload(
      "Flat 204, Example Apartments, Anekal Road, Bengaluru"
    )
  );

  /*
   * 7. Confirm order
   */
  const result = await send(
    "7. CONFIRM ORDER",
    buttonReplyPayload(
      "confirm_order",
      "Confirm order"
    )
  );

  /*
   * 8. Verify order in database
   */
  console.log("\n========== DATABASE VERIFICATION ==========");

  if (!result.orderNumber) {
    throw new Error(
      "Webhook completed but did not return an order number."
    );
  }

  const createdOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNumber, result.orderNumber))
    .limit(1);

  const createdOrder = createdOrders[0];

  if (!createdOrder) {
    throw new Error(
      `Order ${result.orderNumber} was not found in the database.`
    );
  }

  const createdItems = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, createdOrder.id));

  console.log("\nORDER FOUND");
  console.log("----------------------------");
  console.log(`Order number: ${createdOrder.orderNumber}`);
  console.log(`Restaurant: ${restaurant.name}`);
  console.log(`Customer phone: ${createdOrder.customerPhone}`);
  console.log(`Address: ${createdOrder.deliveryAddress}`);
  console.log(`Subtotal: ₹${createdOrder.subtotal}`);
  console.log(`Platform fee: ₹${createdOrder.platformFee}`);
  console.log(`Customer total: ₹${createdOrder.total}`);
  console.log(`Payment: ${createdOrder.paymentMethod}`);
  console.log(`Status: ${createdOrder.status}`);

  console.log("\nORDER ITEMS");
  console.log("----------------------------");

  for (const orderItem of createdItems) {
    console.log(
      `${orderItem.quantity} × ${orderItem.itemName} @ ₹${orderItem.unitPrice} = ₹${orderItem.total}`
    );
  }

  console.log("\n============================================");
  console.log("OFFMENU WHATSAPP TEST PASSED");
  console.log("============================================\n");
}

main().catch((error) => {
  console.error("\n❌ TEST FAILED\n");

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }

  process.exit(1);
});