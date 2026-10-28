export const CURRENT_FEE_MODEL = "OFFMENU_2026_10";

export type OrderFeesPaise = {
  subtotalPaise: number;
  customerPlatformFeePaise: number;
  platformFeePaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
};

export function toPaise(amount: number) {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a finite, non-negative number.");
  }

  const scaledAmount = amount * 100;
  const paise = Math.round(scaledAmount);
  if (!Number.isSafeInteger(paise)) {
    throw new Error("Amount is outside the supported range.");
  }
  if (Math.abs(scaledAmount - paise) > 1e-7) {
    throw new Error("Amount must have no more than two decimal places.");
  }

  return paise;
}

export function toMenuPricePaise(amount: number) {
  const paise = toPaise(amount);
  if (paise === 0) {
    throw new Error("Menu price must be greater than zero.");
  }
  return paise;
}

export function fromPaise(paise: number) {
  if (!Number.isSafeInteger(paise)) {
    throw new Error("Paise amount must be a safe integer.");
  }

  return paise / 100;
}

export function addPaise(left: number, right: number) {
  if (
    !Number.isSafeInteger(left) ||
    left < 0 ||
    !Number.isSafeInteger(right) ||
    right < 0
  ) {
    throw new Error("Paise values must be non-negative safe integers.");
  }

  const sum = left + right;
  if (!Number.isSafeInteger(sum)) {
    throw new Error("Paise total is outside the supported range.");
  }

  return sum;
}

export function calculateOrderFeesPaise(subtotalPaise: number): OrderFeesPaise {
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 0) {
    throw new Error("Subtotal must be a non-negative integer number of paise.");
  }

  const customerPlatformFeePaise = subtotalPaise < 15_000 ? 3_000 : 0;
  const platformFeePaise =
    subtotalPaise < 15_000 ? 0 : Math.round(subtotalPaise / 10);
  const deliveryFeePaise = 0;
  const totalPaise =
    subtotalPaise + customerPlatformFeePaise + deliveryFeePaise;
  if (!Number.isSafeInteger(totalPaise)) {
    throw new Error("Order total is outside the supported range.");
  }

  return {
    subtotalPaise,
    customerPlatformFeePaise,
    platformFeePaise,
    deliveryFeePaise,
    totalPaise,
  };
}

export function calculateOrderFees(subtotal: number) {
  const fees = calculateOrderFeesPaise(toPaise(subtotal));

  return {
    deliveryFee: fromPaise(fees.deliveryFeePaise),
    customerPlatformFee: fromPaise(fees.customerPlatformFeePaise),
    platformFee: fromPaise(fees.platformFeePaise),
    total: fromPaise(fees.totalPaise),
  };
}

export function calculateCartSubtotalPaise(
  cart: { price: number; quantity: number }[],
) {
  const subtotalPaise = cart.reduce((sum, item) => {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Cart quantities must be positive integers.");
    }

    return addPaise(sum, toPaise(item.price) * item.quantity);
  }, 0);

  return subtotalPaise;
}
