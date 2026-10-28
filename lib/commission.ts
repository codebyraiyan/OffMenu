import { addPaise, CURRENT_FEE_MODEL, toPaise } from "./fees";

export const COMMISSION_ELIGIBLE_STATUSES = [
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
] as const;

export type FeeOrderRecord = {
  status: string;
  feeModel: string;
  subtotal: number;
  customerPlatformFee: number;
  platformFee: number;
  deliveryFee: number;
  total: number;
};

export function calculateCommissionSummary(
  orders: FeeOrderRecord[],
  receivedPaise: number,
) {
  if (!Number.isSafeInteger(receivedPaise) || receivedPaise < 0) {
    throw new Error("Received commission must be a non-negative safe integer.");
  }

  const eligible = orders.filter((order) =>
    COMMISSION_ELIGIBLE_STATUSES.includes(
      order.status as (typeof COMMISSION_ELIGIBLE_STATUSES)[number],
    ),
  );

  const currentModel = eligible.filter(
    (order) => order.feeModel === CURRENT_FEE_MODEL,
  );
  const legacyModel = eligible.filter(
    (order) => order.feeModel !== CURRENT_FEE_MODEL,
  );
  const commissionOwedPaise = currentModel.reduce(
    (sum, order) => addPaise(sum, toPaise(order.platformFee)),
    0,
  );
  const legacyPlatformFeesPaise = legacyModel.reduce(
    (sum, order) => addPaise(sum, toPaise(order.platformFee)),
    0,
  );

  return {
    orderCount: eligible.length,
    subtotalPaise: eligible.reduce(
      (sum, order) => addPaise(sum, toPaise(order.subtotal)),
      0,
    ),
    customerPlatformFeesPaise: eligible.reduce(
      (sum, order) => addPaise(sum, toPaise(order.customerPlatformFee)),
      0,
    ),
    deliveryFeesPaise: eligible.reduce(
      (sum, order) => addPaise(sum, toPaise(order.deliveryFee)),
      0,
    ),
    customerTotalPaise: eligible.reduce(
      (sum, order) => addPaise(sum, toPaise(order.total)),
      0,
    ),
    commissionOwedPaise,
    legacyPlatformFeesPaise,
    commissionReceivedPaise: receivedPaise,
    commissionOutstandingPaise: Math.max(
      0,
      commissionOwedPaise - receivedPaise,
    ),
    commissionOverpaymentPaise: Math.max(
      0,
      receivedPaise - commissionOwedPaise,
    ),
  };
}
