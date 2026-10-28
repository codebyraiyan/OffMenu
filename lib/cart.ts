import { toPaise } from "./fees";
import { createHash } from "node:crypto";

export type CartLine = {
  menuItemId: number;
  name: string;
  price: number;
  quantity: number;
};

export function reconcileCart(
  cart: CartLine[],
  currentItems: Map<number, { id: number; name: string; price: number; isAvailable: boolean }>,
) {
  const updatedCart: CartLine[] = [];
  const unavailableNames: string[] = [];

  for (const line of cart) {
    const current = currentItems.get(line.menuItemId);
    if (!current || !current.isAvailable) {
      unavailableNames.push(line.name);
      continue;
    }

    const quantity = Number.isSafeInteger(line.quantity) && line.quantity > 0
      ? Math.min(line.quantity, 99)
      : 1;

    updatedCart.push({
      menuItemId: current.id,
      name: current.name,
      price: current.price,
      quantity,
    });
  }

  const changed =
    unavailableNames.length > 0 ||
    updatedCart.length !== cart.length ||
    updatedCart.some((line) => {
      const previous = cart.find((item) => item.menuItemId === line.menuItemId);
      return !previous ||
        previous.name !== line.name ||
        toPaise(previous.price) !== toPaise(line.price) ||
        previous.quantity !== line.quantity;
    });

  return { changed, updatedCart, unavailableNames };
}

export function changeCartQuantity(cart: CartLine[], itemId: number, action: "add" | "remove" | "delete") {
  const next = cart.map((item) => ({ ...item }));
  const index = next.findIndex((item) => item.menuItemId === itemId);
  if (index < 0) return next;

  const currentQuantity = Number.isSafeInteger(next[index].quantity) && next[index].quantity > 0
    ? Math.min(next[index].quantity, 99)
    : 1;

  if (action === "add") {
    next[index].quantity = Math.min(99, currentQuantity + 1);
  } else if (action === "remove" && currentQuantity > 1) {
    next[index].quantity = currentQuantity - 1;
  } else {
    next.splice(index, 1);
  }

  return next;
}

export function orderConfirmationToken(session: {
  restaurantId: number | null;
  cart: CartLine[];
  customerNote: string | null;
  deliveryAddress: string | null;
}) {
  const snapshot = JSON.stringify({
    restaurantId: session.restaurantId,
    cart: session.cart.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      pricePaise: toPaise(item.price),
      quantity: item.quantity,
    })),
    customerNote: session.customerNote,
    deliveryAddress: session.deliveryAddress,
  });
  return createHash("sha256").update(snapshot).digest("hex").slice(0, 16);
}
