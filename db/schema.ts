import {
  sqliteTable,
  text,
  integer,
  real
} from "drizzle-orm/sqlite-core";

export const restaurants = sqliteTable("restaurants", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  name: text("name").notNull(),

  description: text("description"),

  phone: text("phone").notNull(),

  whatsapp: text("whatsapp"),

  address: text("address"),

  area: text("area").notNull(),

  imageUrl: text("image_url"),

  isOpen: integer("is_open", { mode: "boolean" })
    .notNull()
    .default(true),

  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date())
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id, {
      onDelete: "cascade"
    }),

  name: text("name").notNull(),

  sortOrder: integer("sort_order")
    .notNull()
    .default(0)
});

export const menuItems = sqliteTable("menu_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id, {
      onDelete: "cascade"
    }),

  categoryId: integer("category_id")
    .references(() => categories.id, {
      onDelete: "set null"
    }),

  name: text("name").notNull(),

  description: text("description"),

  price: real("price").notNull(),

  imageUrl: text("image_url"),

  isAvailable: integer("is_available", {
    mode: "boolean"
  })
    .notNull()
    .default(true),

  createdAt: integer("created_at", {
    mode: "timestamp"
  })
    .notNull()
    .$defaultFn(() => new Date())
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  orderNumber: text("order_number").notNull().unique(),

  restaurantId: integer("restaurant_id")
    .notNull()
    .references(() => restaurants.id),

  customerName: text("customer_name"),

  customerPhone: text("customer_phone").notNull(),

  deliveryAddress: text("delivery_address").notNull(),

  customerNote: text("customer_note"),

  subtotal: real("subtotal").notNull(),

  platformFee: real("platform_fee")
    .notNull()
    .default(30),

  total: real("total").notNull(),

  paymentMethod: text("payment_method")
    .notNull()
    .default("COD_OR_UPI"),

  status: text("status")
    .notNull()
    .default("PLACED"),

  createdAt: integer("created_at", {
    mode: "timestamp"
  })
    .notNull()
    .$defaultFn(() => new Date())
});

export const orderItems = sqliteTable("order_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, {
      onDelete: "cascade"
    }),

  menuItemId: integer("menu_item_id")
    .notNull()
    .references(() => menuItems.id),

  itemName: text("item_name").notNull(),

  quantity: integer("quantity").notNull(),

  unitPrice: real("unit_price").notNull(),

  note: text("note"),

  total: real("total").notNull()
});

/*
 * WhatsApp conversation state.
 *
 * This is what allows OffMenu to remember where a customer
 * currently is in the ordering process.
 */
export const whatsappSessions = sqliteTable(
  "whatsapp_sessions",
  {
    phone: text("phone").primaryKey(),

    state: text("state")
      .notNull()
      .default("START"),

    restaurantId: integer("restaurant_id")
      .references(() => restaurants.id, {
        onDelete: "set null"
      }),

    cart: text("cart")
      .notNull()
      .default("[]"),

    customerNote: text("customer_note"),

    deliveryAddress: text("delivery_address"),

    updatedAt: integer("updated_at", {
      mode: "timestamp"
    })
      .notNull()
      .$defaultFn(() => new Date())
  }
);

/*
 * WhatsApp webhook idempotency.
 *
 * Meta can retry webhook events. We store every WhatsApp
 * message ID we have processed so the same event can never
 * be handled twice.
 */
export const processedWhatsappMessages = sqliteTable(
  "processed_whatsapp_messages",
  {
    messageId: text("message_id").primaryKey(),

    processedAt: integer("processed_at", {
      mode: "timestamp"
    })
      .notNull()
      .$defaultFn(() => new Date())
  }
);