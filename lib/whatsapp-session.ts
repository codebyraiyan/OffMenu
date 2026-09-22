import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  whatsappSessions
} from "@/db/schema";

export type CartItem = {
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
};

export type WhatsAppSession = {
  phone: string;
  state: string;
  restaurantId: number | null;
  cart: CartItem[];
  customerNote: string | null;
  deliveryAddress: string | null;
};

export async function getSession(
  phone: string
): Promise<WhatsAppSession> {
  const rows = await db
    .select()
    .from(whatsappSessions)
    .where(
      eq(
        whatsappSessions.phone,
        phone
      )
    )
    .limit(1);

  const row = rows[0];

  if (!row) {
    await db
      .insert(whatsappSessions)
      .values({
        phone,
        state: "START",
        cart: "[]",
        updatedAt: new Date()
      });

    return {
      phone,
      state: "START",
      restaurantId: null,
      cart: [],
      customerNote: null,
      deliveryAddress: null
    };
  }

  let cart: CartItem[] = [];

  try {
    cart = JSON.parse(row.cart);
  } catch {
    cart = [];
  }

  return {
    phone: row.phone,
    state: row.state,
    restaurantId: row.restaurantId,
    cart,
    customerNote: row.customerNote,
    deliveryAddress: row.deliveryAddress
  };
}

export async function saveSession(
  session: WhatsAppSession
) {
  await db
    .update(whatsappSessions)
    .set({
      state: session.state,
      restaurantId:
        session.restaurantId,
      cart: JSON.stringify(session.cart),
      customerNote:
        session.customerNote,
      deliveryAddress:
        session.deliveryAddress,
      updatedAt: new Date()
    })
    .where(
      eq(
        whatsappSessions.phone,
        session.phone
      )
    );
}

export async function resetSession(
  phone: string
) {
  await db
    .update(whatsappSessions)
    .set({
      state: "START",
      restaurantId: null,
      cart: "[]",
      customerNote: null,
      deliveryAddress: null,
      updatedAt: new Date()
    })
    .where(
      eq(
        whatsappSessions.phone,
        phone
      )
    );
}