import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const restaurants = sqliteTable(
  "restaurants",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true,
      }),

    name: text("name").notNull(),

    description: text("description"),

    phone: text("phone").notNull(),

    whatsapp: text("whatsapp"),

    address: text("address"),

    area: text("area").notNull(),

    imageUrl: text("image_url"),

    username: text("username").unique(),

    passwordHash: text("password_hash"),

    isOpen: integer("is_open", {
      mode: "boolean",
    })
      .notNull()
      .default(true),

    // Controls marketplace visibility independently of isOpen.
    isActive: integer("is_active", {
      mode: "boolean",
    })
      .notNull()
      .default(true),

    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true,
      }),

    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id, {
        onDelete: "cascade",
      }),

    name: text("name").notNull(),

    sortOrder: integer("sort_order")
      .notNull()
      .default(0),
  },
);

export const menuItems = sqliteTable(
  "menu_items",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true,
      }),

    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id, {
        onDelete: "cascade",
      }),

    categoryId: integer("category_id").references(
      () => categories.id,
      {
        onDelete: "set null",
      },
    ),

    name: text("name").notNull(),

    description: text("description"),

    price: real("price").notNull(),

    imageUrl: text("image_url"),

    isAvailable: integer("is_available", {
      mode: "boolean",
    })
      .notNull()
      .default(true),

    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true,
      }),

    orderNumber: text("order_number")
      .notNull()
      .unique(),

    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id),

    customerName: text("customer_name"),

    customerPhone: text("customer_phone").notNull(),

    deliveryAddress: text("delivery_address").notNull(),

    customerNote: text("customer_note"),

    /*
     * Total value of food ordered before fees.
     */
    subtotal: real("subtotal").notNull(),

    /*
     * Actual delivery fee charged to the customer.
     * OffMenu Phase 1 currently charges ₹0.
     */
    deliveryFee: real("delivery_fee")
      .notNull()
      .default(0),

    /*
     * Customer-facing OffMenu fee.
     * Subtotal below ₹150 = ₹30.
     * Subtotal ₹150 or above = ₹0.
     */
    customerPlatformFee: real("customer_platform_fee")
      .notNull()
      .default(0),

    /*
     * Restaurant commission owed to OffMenu.
     * Subtotal below ₹150 = ₹0.
     * Subtotal ₹150 or above = 10% of subtotal.
     */
    platformFee: real("platform_fee")
      .notNull()
      .default(0),

    // Existing rows stay on the legacy rules unless explicitly stamped.
    feeModel: text("fee_model")
      .notNull()
      .default("LEGACY"),

    /*
     * Customer total = subtotal
     * + customerPlatformFee + deliveryFee.
     */
    total: real("total").notNull(),

    paymentMethod: text("payment_method")
      .notNull()
      .default("COD_OR_UPI"),

    status: text("status")
      .notNull()
      .default("NEW"),

    createdAt: integer("created_at", {
      mode: "timestamp",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const commissionSettlements = sqliteTable(
  "commission_settlements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurants.id),
    amountPaise: integer("amount_paise").notNull(),
    paidAt: integer("paid_at", { mode: "timestamp" }).notNull(),
    paymentReference: text("payment_reference"),
    notes: text("notes"),
    periodStart: integer("period_start", { mode: "timestamp" }),
    periodEnd: integer("period_end", { mode: "timestamp" }),
    idempotencyKey: text("idempotency_key").notNull(),
    recordedAt: integer("recorded_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("commission_settlements_idempotency_unique").on(
      table.idempotencyKey,
    ),
    uniqueIndex("commission_settlements_reference_unique").on(
      table.restaurantId,
      table.paymentReference,
    ),
  ],
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true,
      }),

    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id, {
        onDelete: "cascade",
      }),

    menuItemId: integer("menu_item_id")
      .notNull()
      .references(() => menuItems.id),

    itemName: text("item_name").notNull(),

    quantity: integer("quantity").notNull(),

    unitPrice: real("unit_price").notNull(),

    note: text("note"),

    total: real("total").notNull(),
  },
);

/*
 * Keeps a separate order counter for each
 * restaurant and each calendar day.
 *
 * Example:
 * restaurantId = 23
 * orderDate    = 2026-09-03
 * orderCount   = 3
 *
 * This produces:
 * #023030926003
 *
 * The composite primary key guarantees that
 * each restaurant has one counter per day.
 */
export const restaurantDailyOrderCounters =
  sqliteTable(
    "restaurant_daily_order_counters",
    {
      restaurantId: integer("restaurant_id")
        .notNull()
        .references(() => restaurants.id, {
          onDelete: "cascade",
        }),

      orderDate: text("order_date").notNull(),

      orderCount: integer("order_count")
        .notNull()
        .default(0),
    },
    (table) => [
      primaryKey({
        columns: [
          table.restaurantId,
          table.orderDate,
        ],
      }),
    ],
  );

export const whatsappSessions = sqliteTable(
  "whatsapp_sessions",
  {
    phone: text("phone").primaryKey(),

    state: text("state")
      .notNull()
      .default("START"),

    restaurantId: integer("restaurant_id").references(
      () => restaurants.id,
      {
        onDelete: "set null",
      },
    ),

    cart: text("cart")
      .notNull()
      .default("[]"),

    customerNote: text("customer_note"),

    deliveryAddress: text("delivery_address"),

    updatedAt: integer("updated_at", {
      mode: "timestamp",
    })
      .notNull()
      .$defaultFn(() => new Date()),
  },
);

export const processedWhatsappMessages =
  sqliteTable(
    "processed_whatsapp_messages",
    {
      messageId: text("message_id").primaryKey(),

      processedAt: integer("processed_at", {
        mode: "timestamp",
      })
        .notNull()
        .$defaultFn(() => new Date()),

      status: text("status")
        .notNull()
        .default("COMPLETED"),

      attemptCount: integer("attempt_count")
        .notNull()
        .default(0),

      claimToken: text("claim_token"),

      leaseExpiresAt: integer("lease_expires_at", {
        mode: "timestamp",
      }),

      completedAt: integer("completed_at", {
        mode: "timestamp",
      }),

      lastError: text("last_error"),
    },
  );

export const whatsappOutbox = sqliteTable(
  "whatsapp_outbox",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    idempotencyKey: text("idempotency_key").notNull(),
    recipient: text("recipient").notNull(),
    payload: text("payload").notNull(),
    status: text("status").notNull().default("PENDING"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    claimToken: text("claim_token"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp" }),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    sentAt: integer("sent_at", { mode: "timestamp" }),
  },
  (table) => [
    uniqueIndex("whatsapp_outbox_idempotency_unique").on(table.idempotencyKey),
    index("whatsapp_outbox_delivery_idx").on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
  ],
);
