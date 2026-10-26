import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey
} from "drizzle-orm/sqlite-core";

export const restaurants = sqliteTable(
  "restaurants",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true
      }),

    name: text("name").notNull(),

    description: text(
      "description"
    ),

    phone: text("phone").notNull(),

    whatsapp: text("whatsapp"),

    address: text("address"),

    area: text("area").notNull(),

    imageUrl: text(
      "image_url"
    ),

    username: text("username").unique(),

    passwordHash: text(
      "password_hash"
    ),

    isOpen: integer("is_open", {
      mode: "boolean"
    })
      .notNull()
      .default(true),

    // Controls marketplace visibility independently of isOpen.
    isActive: integer("is_active", {
      mode: "boolean"
    })
      .notNull()
      .default(true),

    createdAt: integer(
      "created_at",
      {
        mode: "timestamp"
      }
    )
      .notNull()
      .$defaultFn(
        () => new Date()
      )
  }
);

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true
      }),

    restaurantId: integer(
      "restaurant_id"
    )
      .notNull()
      .references(
        () => restaurants.id,
        {
          onDelete: "cascade"
        }
      ),

    name: text("name").notNull(),

    sortOrder: integer(
      "sort_order"
    )
      .notNull()
      .default(0)
  }
);

export const menuItems = sqliteTable(
  "menu_items",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true
      }),

    restaurantId: integer(
      "restaurant_id"
    )
      .notNull()
      .references(
        () => restaurants.id,
        {
          onDelete: "cascade"
        }
      ),

    categoryId: integer(
      "category_id"
    ).references(
      () => categories.id,
      {
        onDelete: "set null"
      }
    ),

    name: text("name").notNull(),

    description: text(
      "description"
    ),

    price: real("price").notNull(),

    imageUrl: text(
      "image_url"
    ),

    isAvailable: integer(
      "is_available",
      {
        mode: "boolean"
      }
    )
      .notNull()
      .default(true),

    createdAt: integer(
      "created_at",
      {
        mode: "timestamp"
      }
    )
      .notNull()
      .$defaultFn(
        () => new Date()
      )
  }
);

export const orders = sqliteTable(
  "orders",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true
      }),

    orderNumber: text(
      "order_number"
    )
      .notNull()
      .unique(),

    restaurantId: integer(
      "restaurant_id"
    )
      .notNull()
      .references(
        () => restaurants.id
      ),

    customerName: text(
      "customer_name"
    ),

    customerPhone: text(
      "customer_phone"
    ).notNull(),

    deliveryAddress: text(
      "delivery_address"
    ).notNull(),

    customerNote: text(
      "customer_note"
    ),

    /*
     * Total value of food ordered
     * before any delivery fee.
     */
    subtotal: real(
      "subtotal"
    ).notNull(),

    /*
     * Delivery fee paid by the customer
     * to the restaurant/delivery person.
     *
     * < ₹150 subtotal = ₹30
     * ₹150–₹500+ tiers = ₹0
     */
    deliveryFee: real(
      "delivery_fee"
    )
      .notNull()
      .default(0),

    /*
     * Fee owed by the restaurant
     * to OffMenu.
     *
     * < ₹150 = ₹30
     * ₹150–₹250 = ₹20
     * > ₹250–₹500 = ₹30
     * > ₹500 = ₹50
     */
    platformFee: real(
      "platform_fee"
    )
      .notNull()
      .default(0),

    /*
     * Amount paid by the customer
     * to the restaurant/delivery person.
     *
     * total = subtotal + deliveryFee
     */
    total: real(
      "total"
    ).notNull(),

    paymentMethod: text(
      "payment_method"
    )
      .notNull()
      .default("COD_OR_UPI"),

    status: text("status")
      .notNull()
      .default("NEW"),

    createdAt: integer(
      "created_at",
      {
        mode: "timestamp"
      }
    )
      .notNull()
      .$defaultFn(
        () => new Date()
      )
  }
);

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id")
      .primaryKey({
        autoIncrement: true
      }),

    orderId: integer(
      "order_id"
    )
      .notNull()
      .references(
        () => orders.id,
        {
          onDelete: "cascade"
        }
      ),

    menuItemId: integer(
      "menu_item_id"
    )
      .notNull()
      .references(
        () => menuItems.id
      ),

    itemName: text(
      "item_name"
    ).notNull(),

    quantity: integer(
      "quantity"
    ).notNull(),

    unitPrice: real(
      "unit_price"
    ).notNull(),

    note: text("note"),

    total: real(
      "total"
    ).notNull()
  }
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
      restaurantId: integer(
        "restaurant_id"
      )
        .notNull()
        .references(
          () => restaurants.id,
          {
            onDelete: "cascade"
          }
        ),

      orderDate: text(
        "order_date"
      ).notNull(),

      orderCount: integer(
        "order_count"
      )
        .notNull()
        .default(0)
    },
    (table) => [
      primaryKey({
        columns: [
          table.restaurantId,
          table.orderDate
        ]
      })
    ]
  );

export const whatsappSessions =
  sqliteTable(
    "whatsapp_sessions",
    {
      phone: text("phone")
        .primaryKey(),

      state: text("state")
        .notNull()
        .default("START"),

      restaurantId: integer(
        "restaurant_id"
      ).references(
        () => restaurants.id,
        {
          onDelete: "set null"
        }
      ),

      cart: text("cart")
        .notNull()
        .default("[]"),

      customerNote: text(
        "customer_note"
      ),

      deliveryAddress: text(
        "delivery_address"
      ),

      updatedAt: integer(
        "updated_at",
        {
          mode: "timestamp"
        }
      )
        .notNull()
        .$defaultFn(
          () => new Date()
        )
    }
  );

export const processedWhatsappMessages =
  sqliteTable(
    "processed_whatsapp_messages",
    {
      messageId: text(
        "message_id"
      ).primaryKey(),

      processedAt: integer(
        "processed_at",
        {
          mode: "timestamp"
        }
      )
        .notNull()
        .$defaultFn(
          () => new Date()
        )
    }
  );