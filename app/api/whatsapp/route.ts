
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  inArray,
  lt,
  or,
  sql
} from "drizzle-orm";
import { db, withDatabaseTransaction } from "@/db";
import {
  restaurants,
  menuItems,
  orders,
  orderItems,
  restaurantDailyOrderCounters,
  processedWhatsappMessages,
  whatsappSessions
} from "@/db/schema";
import {
  sendButtons,
  sendMenu,
  sendRestaurantList,
  sendCartEditor,
  sendText
} from "@/lib/whatsapp";
import {
  getSession,
  saveSession,
  resetSession,
  CartItem,
  WhatsAppSession
} from "@/lib/whatsapp-session";
import {
  getIndiaDateParts,
  formatOrderNumber,
  money
} from "@/lib/utils";
import {
  calculateCartSubtotalPaise,
  calculateOrderFees as feeCalculation,
  fromPaise,
  toPaise,
  CURRENT_FEE_MODEL
} from "@/lib/fees";
import { changeCartQuantity, orderConfirmationToken, reconcileCart } from "@/lib/cart";
import { verifyWhatsappSignature } from "@/lib/webhook-signature";
import { processInboundMessage, runWithAtomicClaim } from "@/lib/webhook-idempotency";
import { withInboundOutboxContext } from "@/lib/whatsapp-outbox";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(challenge);
  }

  return new Response("Forbidden", { status: 403 });
}

function cartTotal(cart: CartItem[]) {
  return fromPaise(calculateCartSubtotalPaise(cart));
}

function cartReviewText(cart: CartItem[]) {
  const subtotal = cartTotal(cart);
  const fees = feeCalculation(subtotal);
  return (
    `${formatCart(cart)}\n\n` +
    `Food subtotal: ${money(subtotal)}\n` +
    `Customer OffMenu fee: ${money(fees.customerPlatformFee)}\n` +
    `Delivery fee: ${money(fees.deliveryFee)}\n` +
    `Customer total: ${money(fees.total)}`
  );
}

function formatCart(cart: CartItem[]) {
  return cart
    .map(
      (item) =>
        `${item.quantity} × ${item.name} — ${money(
          fromPaise(Math.round(item.price * 100) * item.quantity)
        )}`
    )
    .join("\n");
}

async function handleUnavailableRestaurant(
  phone: string,
  restaurant?: {
    name: string;
    isActive: boolean;
    isOpen: boolean;
  } | null
) {
  let message: string;

  if (!restaurant) {
    message = "That restaurant is no longer available on OffMenu.";
  } else if (!restaurant.isActive) {
    message = `${restaurant.name} is no longer available on OffMenu.`;
  } else {
    message = `${restaurant.name} is currently closed and isn't accepting orders.`;
  }

  await resetSession(phone);

  await sendText(
    phone,
    `${message}\n\nI've cleared your current order. Here are the restaurants available right now.`
  );

  await showRestaurants(phone);
}

async function showRestaurants(phone: string, offset = 0) {
  const available = await db
    .select({
      id: restaurants.id,
      name: restaurants.name
    })
    .from(restaurants)
    .where(
      and(
        eq(restaurants.isActive, true),
        eq(restaurants.isOpen, true)
      )
    )
    .orderBy(asc(restaurants.name));

  if (available.length === 0) {
    await sendText(
      phone,
      "There are no restaurants available right now. Check back soon."
    );
    return;
  }

  await sendRestaurantList(phone, available, offset);
}

async function showRestaurantMenu(
  phone: string,
  restaurantId: number,
  offset = 0
) {
  const restaurantRows = await db
    .select()
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);

  const restaurant = restaurantRows[0];

  if (
    !restaurant ||
    !restaurant.isActive ||
    !restaurant.isOpen
  ) {
    await handleUnavailableRestaurant(phone, restaurant);
    return;
  }

  const items = await db
    .select({
      id: menuItems.id,
      name: menuItems.name,
      price: menuItems.price
    })
    .from(menuItems)
    .where(
      and(
        eq(menuItems.restaurantId, restaurantId),
        eq(menuItems.isAvailable, true)
      )
    )
    .orderBy(asc(menuItems.name));

  if (items.length === 0) {
    await sendText(
      phone,
      `${restaurant.name} hasn't added any available menu items yet.`
    );
    return;
  }

  await sendMenu(phone, restaurant.name, items, offset);
}

async function showCart(phone: string, session: WhatsAppSession) {
  if (session.cart.length === 0) {
    await sendButtons(phone, "Your cart is empty.", [
      { id: "browse_restaurants", title: "Choose restaurant" },
      { id: "cancel_order", title: "Cancel" },
    ]);
    return;
  }

  await sendButtons(phone, cartReviewText(session.cart), [
    { id: "add_more", title: "Add items" },
    { id: "edit_cart", title: "Edit cart" },
    { id: "checkout", title: "Checkout" },
  ]);
}

async function showOrderConfirmation(phone: string, session: WhatsAppSession) {
  await sendButtons(
    phone,
    `Please confirm your order.\n\n${cartReviewText(session.cart)}\nPayment: Cash or UPI directly to the restaurant.\n\nDelivery address:\n${session.deliveryAddress}`,
    [
      { id: `confirm_order_${orderConfirmationToken(session)}`, title: "Confirm Order" },
      { id: "edit_cart", title: "Edit Cart" },
      { id: "cancel_order", title: "Cancel" },
    ],
  );
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret && process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "WhatsApp webhook signature verification is not configured." },
        { status: 503 },
      );
    }
    if (
      appSecret &&
      !verifyWhatsappSignature(
        rawBody,
        request.headers.get("x-hub-signature-256"),
        appSecret,
      )
    ) {
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];

    if (!message) {
      return NextResponse.json({ received: true });
    }

    const phone = message.from;

    if (!phone) {
      return NextResponse.json({ received: true });
    }

    const processMessage = async () => {
    const session = await getSession(phone);

    const interactiveId =
      message?.interactive?.button_reply?.id ||
      message?.interactive?.list_reply?.id;

    const text = message?.text?.body?.trim();
    const lowerText = text?.toLowerCase();

    /*
     * GLOBAL RESTART
     */
    if (
      lowerText === "hi" ||
      lowerText === "hello" ||
      lowerText === "start" ||
      lowerText === "restart"
    ) {
      await resetSession(phone);

      await sendButtons(
        phone,
        "Welcome to OffMenu.\n\nOrder directly from local restaurants without unnecessary platform fees.",
        [
          {
            id: "browse_restaurants",
            title: "Order Now"
          }
        ]
      );

      return NextResponse.json({ received: true });
    }

    /*
     * ORDER NOW
     */
    if (
      interactiveId === "browse_restaurants" ||
      interactiveId === "order_now"
    ) {
      session.state = "CHOOSING_RESTAURANT";
      session.restaurantId = null;
      session.cart = [];
      session.customerNote = null;
      session.deliveryAddress = null;

      await saveSession(session);
      await showRestaurants(phone);

      return NextResponse.json({ received: true });
    }

    if (interactiveId?.startsWith("restaurant_page_")) {
      const offset = Number(interactiveId.slice("restaurant_page_".length));
      if (!Number.isSafeInteger(offset) || offset < 0) {
        await sendText(phone, "That page selection is invalid. Please start again.");
      } else {
        await showRestaurants(phone, offset);
      }
      return NextResponse.json({ received: true });
    }

    if (interactiveId?.startsWith("menu_page_")) {
      const offset = Number(interactiveId.slice("menu_page_".length));
      if (!Number.isSafeInteger(offset) || offset < 0 || !session.restaurantId) {
        await sendText(phone, "That menu page is no longer available. Please choose a restaurant again.");
        await showRestaurants(phone);
      } else {
        await showRestaurantMenu(phone, session.restaurantId, offset);
      }
      return NextResponse.json({ received: true });
    }

    if (interactiveId === "edit_cart") {
      if (session.cart.length === 0) {
        await sendText(phone, "Your cart is empty.");
      } else {
        session.state = "CART";
        await saveSession(session);
        await sendCartEditor(phone, session.cart);
      }
      return NextResponse.json({ received: true });
    }

    if (interactiveId?.startsWith("cart_page_")) {
      const offset = Number(interactiveId.slice("cart_page_".length));
      if (!Number.isSafeInteger(offset) || offset < 0) {
        await sendText(phone, "That cart page is invalid.");
      } else {
        await sendCartEditor(phone, session.cart, offset);
      }
      return NextResponse.json({ received: true });
    }

    if (interactiveId?.startsWith("cart_item_")) {
      const itemId = Number(interactiveId.slice("cart_item_".length));
      const item = session.cart.find((cartItem) => cartItem.menuItemId === itemId);
      if (!Number.isSafeInteger(itemId) || !item) {
        await sendText(phone, "That cart item is no longer available.");
      } else {
        await sendButtons(
          phone,
          `${item.name}\nQuantity: ${item.quantity}\nUnit price: ${money(item.price)}\nLine total: ${money(item.price * item.quantity)}`,
          [
            { id: `cart_add_${itemId}`, title: "+1" },
            { id: `cart_remove_${itemId}`, title: "−1" },
            { id: `cart_delete_${itemId}`, title: "Remove" },
          ],
        );
      }
      return NextResponse.json({ received: true });
    }

    const cartAction = interactiveId?.match(/^cart_(add|remove|delete)_(\d+)$/);
    if (cartAction) {
      const itemId = Number(cartAction[2]);
      const index = session.cart.findIndex((item) => item.menuItemId === itemId);
      if (index < 0) {
        await sendText(phone, "That cart item is no longer available.");
      } else if (cartAction[1] === "add") {
        session.cart = changeCartQuantity(session.cart, itemId, "add");
      } else if (cartAction[1] === "remove" && session.cart[index].quantity > 1) {
        session.cart = changeCartQuantity(session.cart, itemId, "remove");
      } else {
        session.cart = changeCartQuantity(session.cart, itemId, "delete");
      }
      await saveSession(session);
      await showCart(phone, session);
      return NextResponse.json({ received: true });
    }

    /*
     * RESTAURANT SELECTED
     */
    if (interactiveId?.startsWith("restaurant_")) {
      const restaurantId = Number(
        interactiveId.replace("restaurant_", "")
      );

      if (!Number.isInteger(restaurantId)) {
        await sendText(
          phone,
          "That restaurant selection is invalid. Please start again."
        );

        return NextResponse.json({ received: true });
      }

      const restaurantRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, restaurantId))
        .limit(1);

      const restaurant = restaurantRows[0];

      if (
        !restaurant ||
        !restaurant.isActive ||
        !restaurant.isOpen
      ) {
        await handleUnavailableRestaurant(phone, restaurant);
        return NextResponse.json({ received: true });
      }

      session.restaurantId = restaurantId;
      session.cart = [];
      session.customerNote = null;
      session.deliveryAddress = null;
      session.state = "CHOOSING_ITEM";

      await saveSession(session);
      await showRestaurantMenu(phone, restaurantId);

      return NextResponse.json({ received: true });
    }

    /*
     * ITEM SELECTED
     */
    if (interactiveId?.startsWith("item_")) {
      const itemId = Number(
        interactiveId.replace("item_", "")
      );

      if (!Number.isInteger(itemId)) {
        await sendText(
          phone,
          "That menu item selection is invalid. Please start again."
        );

        return NextResponse.json({ received: true });
      }

      if (!session.restaurantId) {
        await sendText(phone, "Please choose a restaurant first.");
        await showRestaurants(phone);

        return NextResponse.json({ received: true });
      }

      const selectedRestaurantRows = await db
        .select({
          name: restaurants.name,
          isActive: restaurants.isActive,
          isOpen: restaurants.isOpen
        })
        .from(restaurants)
        .where(eq(restaurants.id, session.restaurantId))
        .limit(1);

      const selectedRestaurant = selectedRestaurantRows[0];

      if (
        !selectedRestaurant ||
        !selectedRestaurant.isActive ||
        !selectedRestaurant.isOpen
      ) {
        await handleUnavailableRestaurant(
          phone,
          selectedRestaurant
        );

        return NextResponse.json({ received: true });
      }

      const itemRows = await db
        .select({
          id: menuItems.id,
          restaurantId: menuItems.restaurantId,
          name: menuItems.name,
          price: menuItems.price,
          isAvailable: menuItems.isAvailable
        })
        .from(menuItems)
        .where(
          and(
            eq(menuItems.id, itemId),
            eq(menuItems.restaurantId, session.restaurantId),
            eq(menuItems.isAvailable, true)
          )
        )
        .limit(1);

      const item = itemRows[0];

      if (!item) {
        await sendText(
          phone,
          "That item is no longer available. Please choose another item."
        );

        await showRestaurantMenu(phone, session.restaurantId);

        return NextResponse.json({ received: true });
      }

      const existing = session.cart.find(
        (cartItem) => cartItem.menuItemId === item.id
      );

      if (existing) {
        session.cart = changeCartQuantity(session.cart, item.id, "add");
        const updatedItem = session.cart.find(
          (cartItem) => cartItem.menuItemId === item.id,
        );
        if (updatedItem) {
          updatedItem.price = item.price;
          updatedItem.name = item.name;
        }
      } else {
        session.cart.push({
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          quantity: 1
        });
      }

      session.state = "CART";
      await saveSession(session);
      await showCart(phone, session);

      return NextResponse.json({ received: true });
    }

    /*
     * ADD MORE
     */
    if (interactiveId === "add_more") {
      if (!session.restaurantId) {
        await showRestaurants(phone);
        return NextResponse.json({ received: true });
      }

      session.state = "CHOOSING_ITEM";
      await saveSession(session);
      await showRestaurantMenu(phone, session.restaurantId);

      return NextResponse.json({ received: true });
    }

    /*
     * CLEAR CART
     */
    if (interactiveId === "clear_cart") {
      session.cart = [];
      session.state = "CHOOSING_ITEM";
      session.customerNote = null;
      session.deliveryAddress = null;

      await saveSession(session);

      if (session.restaurantId) {
        await showRestaurantMenu(phone, session.restaurantId);
      } else {
        await showRestaurants(phone);
      }

      return NextResponse.json({ received: true });
    }

    /*
     * CHECKOUT
     */
    if (interactiveId === "checkout") {
      if (session.cart.length === 0) {
        await sendText(phone, "Your cart is empty.");
        return NextResponse.json({ received: true });
      }

      if (!session.restaurantId) {
        await sendText(
          phone,
          "Please choose a restaurant before checking out."
        );

        await showRestaurants(phone);

        return NextResponse.json({ received: true });
      }

      const restaurantRows = await db
        .select({
          id: restaurants.id,
          name: restaurants.name,
          isActive: restaurants.isActive,
          isOpen: restaurants.isOpen
        })
        .from(restaurants)
        .where(eq(restaurants.id, session.restaurantId))
        .limit(1);

      const restaurant = restaurantRows[0];

      if (
        !restaurant ||
        !restaurant.isActive ||
        !restaurant.isOpen
      ) {
        await handleUnavailableRestaurant(phone, restaurant);
        return NextResponse.json({ received: true });
      }

      session.state = "WAITING_FOR_NOTE";
      await saveSession(session);

      await sendText(
        phone,
        `Your cart:\n\n${cartReviewText(session.cart)}\n\nAdd a note for the restaurant, or reply SKIP if you don't have one.`
      );

      return NextResponse.json({ received: true });
    }

    /*
     * CUSTOMER NOTE
     */
    if (session.state === "WAITING_FOR_NOTE") {
      if (!session.restaurantId) {
        await resetSession(phone);

        await sendText(
          phone,
          "Your restaurant selection has expired. Let's choose an available restaurant."
        );

        await showRestaurants(phone);

        return NextResponse.json({ received: true });
      }

      const noteRestaurantRows = await db
        .select({
          name: restaurants.name,
          isActive: restaurants.isActive,
          isOpen: restaurants.isOpen
        })
        .from(restaurants)
        .where(eq(restaurants.id, session.restaurantId))
        .limit(1);

      const noteRestaurant = noteRestaurantRows[0];

      if (
        !noteRestaurant ||
        !noteRestaurant.isActive ||
        !noteRestaurant.isOpen
      ) {
        await handleUnavailableRestaurant(phone, noteRestaurant);
        return NextResponse.json({ received: true });
      }

      session.customerNote =
        lowerText === "skip" ? null : text || null;

      session.state = "WAITING_FOR_ADDRESS";
      await saveSession(session);

      await sendText(
        phone,
        "Great. Now send your complete delivery address.\n\nPlease include house/building number, street, area and any useful landmark."
      );

      return NextResponse.json({ received: true });
    }

    /*
     * DELIVERY ADDRESS
     */
    if (session.state === "WAITING_FOR_ADDRESS") {
      if (!text || text.length < 8) {
        await sendText(
          phone,
          "Please send a complete delivery address so the restaurant can deliver your order."
        );

        return NextResponse.json({ received: true });
      }

      if (!session.restaurantId) {
        await sendText(
          phone,
          "Something went wrong with your restaurant selection. Please start again."
        );

        await resetSession(phone);

        return NextResponse.json({ received: true });
      }

      const restaurantRows = await db
        .select({
          id: restaurants.id,
          name: restaurants.name,
          isActive: restaurants.isActive,
          isOpen: restaurants.isOpen
        })
        .from(restaurants)
        .where(eq(restaurants.id, session.restaurantId))
        .limit(1);

      const restaurant = restaurantRows[0];

      if (
        !restaurant ||
        !restaurant.isActive ||
        !restaurant.isOpen
      ) {
        await handleUnavailableRestaurant(phone, restaurant);
        return NextResponse.json({ received: true });
      }

      session.deliveryAddress = text;
      session.state = "WAITING_FOR_CONFIRMATION";

      await saveSession(session);

      await showOrderConfirmation(phone, session);

      return NextResponse.json({ received: true });
    }

    /*
     * ADD ITEMS TO ORDER
     */
    if (interactiveId === "add_items_to_order") {
      if (!session.restaurantId) {
        await showRestaurants(phone);
        return NextResponse.json({ received: true });
      }

      session.state = "CHOOSING_ITEM";
      await saveSession(session);
      await showRestaurantMenu(phone, session.restaurantId);

      return NextResponse.json({ received: true });
    }

    /*
     * CONFIRM ORDER
     */
    if (interactiveId?.startsWith("confirm_order_")) {
      if (
        session.state !== "WAITING_FOR_CONFIRMATION" ||
        interactiveId !== `confirm_order_${orderConfirmationToken(session)}`
      ) {
        if (session.state === "WAITING_FOR_CONFIRMATION" && session.cart.length > 0) {
          await sendText(phone, "Your cart or checkout details changed since that confirmation. Please review the current total.");
          await showOrderConfirmation(phone, session);
        } else if (session.cart.length > 0) {
          await sendText(phone, "Your cart changed. Review it and continue to checkout to confirm the current total.");
          await showCart(phone, session);
        } else {
          await sendText(phone, "That confirmation has expired. Please start a new order.");
          await showRestaurants(phone);
        }
        return NextResponse.json({ received: true, confirmationStale: true });
      }

      if (
        !session.restaurantId ||
        session.cart.length === 0 ||
        !session.deliveryAddress
      ) {
        await sendText(
          phone,
          "Something went wrong with your cart. Please start again."
        );

        await resetSession(phone);

        return NextResponse.json({ received: true });
      }

      /*
       * Re-check the restaurant.
       */
      const restaurantRows = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.id, session.restaurantId))
        .limit(1);

      const restaurant = restaurantRows[0];

      if (
        !restaurant ||
        !restaurant.isActive ||
        !restaurant.isOpen
      ) {
        await handleUnavailableRestaurant(phone, restaurant);
        return NextResponse.json({ received: true });
      }

      /*
       * Re-check every cart item against the database.
       * Do not trust prices or names stored in the WhatsApp session.
       */
      const cartItemIds = session.cart.map(
        (item) => item.menuItemId
      );

      const currentItems = await db
        .select({
          id: menuItems.id,
          restaurantId: menuItems.restaurantId,
          name: menuItems.name,
          price: menuItems.price,
          isAvailable: menuItems.isAvailable
        })
        .from(menuItems)
        .where(
          and(
            eq(menuItems.restaurantId, restaurant.id),
            inArray(menuItems.id, cartItemIds)
          )
        );

      const currentItemMap = new Map(
        currentItems.map((item) => [item.id, item])
      );

      const reconciliation = reconcileCart(session.cart, currentItemMap);
      const verifiedCart = reconciliation.updatedCart;
      const changedCart = reconciliation.changed;

      if (changedCart) {
        const unavailableNames = reconciliation.unavailableNames;
        session.cart = verifiedCart;

        if (session.cart.length === 0) {
          await resetSession(phone);
          await sendText(
            phone,
            `Your cart changed and none of its items are available now${unavailableNames.length ? ` (${unavailableNames.join(", ")})` : ""}. No order was placed.`,
          );
          await showRestaurants(phone);
          return NextResponse.json({ received: true });
        }

        session.state = "WAITING_FOR_CONFIRMATION";
        await saveSession(session);
        await sendButtons(
          phone,
          `Your cart changed since you reviewed it. No order was placed. Please review and confirm the updated cart.\n\n${cartReviewText(session.cart)}${unavailableNames.length ? `\n\nRemoved unavailable items: ${unavailableNames.join(", ")}` : ""}\n\nDelivery address:\n${session.deliveryAddress}`,
          [
            { id: `confirm_order_${orderConfirmationToken(session)}`, title: "Confirm Revised" },
            { id: "edit_cart", title: "Edit Cart" },
            { id: "cancel_order", title: "Cancel" },
          ],
        );
        return NextResponse.json({ received: true, cartChanged: true });
      }

      const subtotal = cartTotal(verifiedCart);

      /*
       * Customer-facing OffMenu fee and restaurant commission
       * are separate amounts.
       */
      const {
        deliveryFee,
        customerPlatformFee,
        platformFee,
        total,
      } = feeCalculation(subtotal);

      /*
       * Create the order and its items together.
       * The daily order counter is scoped to each restaurant
       * and India calendar day.
       */
      const { dateKey, dateCode } = getIndiaDateParts();

      let transactionResult;
      try {
        const claimResult = await runWithAtomicClaim(
          async () => {
            const confirmationClaim = await db
              .update(whatsappSessions)
              .set({ state: "CREATING_ORDER", updatedAt: new Date() })
              .where(
                and(
                  eq(whatsappSessions.phone, phone),
                  eq(whatsappSessions.state, "WAITING_FOR_CONFIRMATION"),
                ),
              )
              .returning({ phone: whatsappSessions.phone });
            return confirmationClaim.length > 0;
          },
          async () => {
            session.state = "CREATING_ORDER";
            return db.transaction(async (tx) => {
          // Conditional no-op UPDATE acquires the write transaction
          // before order creation and serializes the status check.
          const statusGuardRows = await tx
            .update(restaurants)
            .set({
              isActive: sql`is_active`
            })
            .where(
              and(
                eq(restaurants.id, restaurant.id),
                eq(restaurants.isActive, true),
                eq(restaurants.isOpen, true)
              )
            )
            .returning({
              id: restaurants.id
            });

          if (statusGuardRows.length === 0) {
            const currentRestaurantRows = await tx
              .select({
                name: restaurants.name,
                isActive: restaurants.isActive,
                isOpen: restaurants.isOpen
              })
              .from(restaurants)
              .where(eq(restaurants.id, restaurant.id))
              .limit(1);

            return {
              order: null,
              unavailableRestaurant:
                currentRestaurantRows[0] ?? null
            };
          }

          const counterRows = await tx
            .insert(restaurantDailyOrderCounters)
            .values({
              restaurantId: restaurant.id,
              orderDate: dateKey,
              orderCount: 1
            })
            .onConflictDoUpdate({
              target: [
                restaurantDailyOrderCounters.restaurantId,
                restaurantDailyOrderCounters.orderDate
              ],
              set: {
                orderCount: sql`${restaurantDailyOrderCounters.orderCount} + 1`
              }
            })
            .returning({
              orderCount:
                restaurantDailyOrderCounters.orderCount
            });

          const counter = counterRows[0];

          if (!counter) {
            throw new Error("Order counter update failed.");
          }

          const orderNumber = formatOrderNumber(
            restaurant.id,
            dateCode,
            counter.orderCount
          );

          const createdOrders = await tx
            .insert(orders)
            .values({
              orderNumber,
              restaurantId: restaurant.id,
              customerPhone: phone,
              deliveryAddress: session.deliveryAddress!,
              customerNote: session.customerNote,
              subtotal,
              deliveryFee,
              customerPlatformFee,
              platformFee,
              feeModel: CURRENT_FEE_MODEL,
              total,
              paymentMethod: "COD_OR_UPI",
              // The restaurant must accept the order first.
              status: "NEW"
            })
            .returning();

          const order = createdOrders[0];

          if (!order) {
            throw new Error("Order creation failed.");
          }

          for (const item of verifiedCart) {
            const unitPricePaise = toPaise(item.price);
            const lineTotalPaise = unitPricePaise * item.quantity;
            await tx
              .insert(orderItems)
              .values({
                orderId: order.id,
                menuItemId: item.menuItemId,
                itemName: item.name,
                quantity: item.quantity,
                unitPrice: fromPaise(unitPricePaise),
                note: null,
                total: fromPaise(lineTotalPaise),
              });
          }

          const resetRows = await tx
            .update(whatsappSessions)
            .set({
              state: "START",
              restaurantId: null,
              cart: "[]",
              customerNote: null,
              deliveryAddress: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(whatsappSessions.phone, phone),
                eq(whatsappSessions.state, "CREATING_ORDER"),
              ),
            )
            .returning({ phone: whatsappSessions.phone });
          if (resetRows.length === 0) {
            throw new Error("Order session could not be finalized.");
          }

          return {
            order,
            unavailableRestaurant: null
          };
            });
          },
        );

        if (!claimResult.claimed) {
          await sendText(phone, "This order is already being placed or has already been submitted.");
          return NextResponse.json({ received: true, duplicate: true });
        }
        transactionResult = claimResult.result;
      } catch (error) {
        session.state = "WAITING_FOR_CONFIRMATION";
        await saveSession(session);
        throw error;
      }

      if (!transactionResult.order) {
        await handleUnavailableRestaurant(
          phone,
          transactionResult.unavailableRestaurant
        );

        return NextResponse.json({ received: true });
      }

      const createdOrder = transactionResult.order;
      const orderNumber = createdOrder.orderNumber;
      const restaurantPhone =
        restaurant.whatsapp || restaurant.phone;

      const restaurantMessage =
        `🔔 NEW OFFMENU ORDER\n\n` +
        `Order: ${orderNumber}\n\n` +
        `${formatCart(verifiedCart)}\n\n` +
        `Food subtotal: ${money(subtotal)}\n` +
        `Customer OffMenu fee to remit: ${money(customerPlatformFee)}\n` +
        `Restaurant commission: ${money(platformFee)}\n` +
        `Customer total to collect: ${money(total)}\n` +
        `Delivery fee: ${money(deliveryFee)}\n` +
        `Payment: Cash / UPI\n\n` +
        `Customer WhatsApp: ${phone}\n\n` +
        `Delivery address:\n${session.deliveryAddress}` +
        (session.customerNote
          ? `\n\nCustomer note:\n${session.customerNote}`
          : "");

      const notificationQueued = {
        restaurant: false,
        customer: false,
        followup: false,
      };
      await sendText(restaurantPhone, restaurantMessage);
      notificationQueued.restaurant = true;

      /*
       * This is NOT ORDER CONFIRMED.
       * The restaurant must accept the order from its dashboard.
       */
      await sendText(
        phone,
        `📦 ORDER RECEIVED\n\n` +
            `Order: ${orderNumber}\n` +
            `Restaurant: ${restaurant.name}\n\n` +
            `${formatCart(verifiedCart)}\n\n` +
            `Food subtotal: ${money(subtotal)}\n` +
            `OffMenu fee: ${money(customerPlatformFee)}\n` +
            `Delivery fee: ${money(deliveryFee)}\n` +
            `Total to pay: ${money(total)}\n` +
            `Payment: Cash or UPI directly to the restaurant.\n\n` +
            `Your order has been recorded and is awaiting restaurant acceptance.\n` +
          `You'll receive a confirmation once the restaurant accepts it.`
      );
      notificationQueued.customer = true;

      await sendButtons(
        phone,
        `Your order #${orderNumber} is waiting for restaurant acceptance.`,
        [{ id: "new_order", title: "New Order" }],
      );
      notificationQueued.followup = true;

      return NextResponse.json({
        received: true,
        orderNumber: createdOrder.orderNumber,
        notificationQueued,
      });
    }

    /*
     * CANCEL ORDER
     */
    if (interactiveId === "cancel_order") {
      await resetSession(phone);

      await sendText(
        phone,
        "Order cancelled.\n\nWhenever you're hungry, just send HI."
      );

      return NextResponse.json({ received: true });
    }

    /*
     * NEW ORDER
     */
    if (interactiveId === "new_order") {
      await resetSession(phone);
      await showRestaurants(phone);

      return NextResponse.json({ received: true });
    }

    /*
     * FALLBACK
     */
    await sendButtons(
      phone,
      "I didn't understand that.\n\nStart a new order below.",
      [
        {
          id: "browse_restaurants",
          title: "Order Now"
        }
      ]
    );

    return NextResponse.json({ received: true });
    };

    if (typeof message.id !== "string" || message.id.length === 0) {
      return NextResponse.json({ error: "Missing message ID." }, { status: 400 });
    }

    const result = await processInboundMessage(
      message.id,
      {
        claim: async (messageId) => db.transaction(async (tx) => {
          const now = new Date();
          const token = randomUUID();
          const leaseExpiresAt = new Date(now.getTime() + 5 * 60 * 1000);
          const inserted = await tx
            .insert(processedWhatsappMessages)
            .values({
              messageId,
              processedAt: now,
              status: "PROCESSING",
              attemptCount: 1,
              claimToken: token,
              leaseExpiresAt,
            })
            .onConflictDoNothing()
            .returning({ messageId: processedWhatsappMessages.messageId });

          if (inserted.length > 0) return { kind: "claimed" as const, token };

          const reclaimed = await tx
            .update(processedWhatsappMessages)
            .set({
              status: "PROCESSING",
              attemptCount: sql`${processedWhatsappMessages.attemptCount} + 1`,
              claimToken: token,
              leaseExpiresAt,
              lastError: null,
              completedAt: null,
            })
            .where(and(
              eq(processedWhatsappMessages.messageId, messageId),
              or(
                eq(processedWhatsappMessages.status, "FAILED"),
                and(
                  eq(processedWhatsappMessages.status, "PROCESSING"),
                  lt(processedWhatsappMessages.leaseExpiresAt, now),
                ),
              ),
            ))
            .returning({ messageId: processedWhatsappMessages.messageId });

          if (reclaimed.length > 0) return { kind: "claimed" as const, token };

          const existing = await tx
            .select({ status: processedWhatsappMessages.status })
            .from(processedWhatsappMessages)
            .where(eq(processedWhatsappMessages.messageId, messageId))
            .limit(1);
          return existing[0]?.status === "COMPLETED"
            ? { kind: "duplicate" as const }
            : { kind: "in_progress" as const };
        }),
        processAtomically: (messageId, token, callback) =>
          withDatabaseTransaction(async () => {
            const owned = await db
              .select({ messageId: processedWhatsappMessages.messageId })
              .from(processedWhatsappMessages)
              .where(and(
                eq(processedWhatsappMessages.messageId, messageId),
                eq(processedWhatsappMessages.status, "PROCESSING"),
                eq(processedWhatsappMessages.claimToken, token),
              ))
              .limit(1);
            if (owned.length === 0) throw new Error("Inbound claim expired.");

            const result = await withInboundOutboxContext(messageId, callback);
            const completed = await db
              .update(processedWhatsappMessages)
              .set({
                status: "COMPLETED",
                completedAt: new Date(),
                claimToken: null,
                leaseExpiresAt: null,
                lastError: null,
              })
              .where(and(
                eq(processedWhatsappMessages.messageId, messageId),
                eq(processedWhatsappMessages.status, "PROCESSING"),
                eq(processedWhatsappMessages.claimToken, token),
              ))
              .returning({ messageId: processedWhatsappMessages.messageId });
            if (completed.length === 0) throw new Error("Inbound claim was lost.");
            return result;
          }),
        markFailed: async (messageId, token) => {
          await db.update(processedWhatsappMessages)
            .set({
              status: "FAILED",
              claimToken: null,
              leaseExpiresAt: null,
              lastError: "Inbound processing failed.",
            })
            .where(and(
              eq(processedWhatsappMessages.messageId, messageId),
              eq(processedWhatsappMessages.status, "PROCESSING"),
              eq(processedWhatsappMessages.claimToken, token),
            ));
        },
      },
      processMessage,
    );

    if (result.kind === "in_progress") {
      return NextResponse.json(
        { received: false, retry: true },
        { status: 503, headers: { "Retry-After": "5" } },
      );
    }
    if (result.kind === "duplicate") {
      return NextResponse.json({
        received: true,
        duplicate: true,
      });
    }
    return result.result;
  } catch (error) {
    console.error("WhatsApp webhook processing failed.", {
      errorType: error instanceof Error ? error.name : "unknown",
    });

    return NextResponse.json(
      {
        error: "Webhook failed"
      },
      {
        status: 500
      }
    );
  }
}
