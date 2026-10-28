import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateOrderFees,
  calculateOrderFeesPaise,
  calculateCartSubtotalPaise,
  addPaise,
  fromPaise,
  toMenuPricePaise,
  toPaise,
} from "../lib/fees";
import { calculateCommissionSummary } from "../lib/commission";
import { changeCartQuantity, orderConfirmationToken, reconcileCart } from "../lib/cart";
import { createHmac } from "node:crypto";
import { verifyWhatsappSignature } from "../lib/webhook-signature";
import { runWithAtomicClaim } from "../lib/webhook-idempotency";
import { sendText } from "../lib/whatsapp";

test("fee boundaries keep customer fees and commission separate", () => {
  for (const [subtotal, customerFee, commission, total] of [
    [100, 30, 0, 130],
    [149, 30, 0, 179],
    [150, 0, 15, 150],
    [200, 0, 20, 200],
    [500, 0, 50, 500],
  ]) {
    assert.deepEqual(calculateOrderFees(subtotal), {
      deliveryFee: 0,
      customerPlatformFee: customerFee,
      platformFee: commission,
      total,
    });
  }
});

test("commission uses integer paise rounding", () => {
  assert.equal(
    calculateOrderFeesPaise(15_005).platformFeePaise,
    1_501,
  );
});

test("menu prices reject negative and unsupported precision values", () => {
  assert.equal(toMenuPricePaise(12.34), 1234);
  assert.throws(() => toMenuPricePaise(-1));
  assert.throws(() => toMenuPricePaise(12.345));
  assert.throws(() => toMenuPricePaise(Number.NaN));
});

test("paise aggregation rejects overflow instead of rounding past safe integers", () => {
  assert.throws(() => addPaise(Number.MAX_SAFE_INTEGER, 1));
  assert.throws(() => addPaise(-1, 1));
  assert.throws(() => calculateCartSubtotalPaise([
    { price: 46_000_000_000_000, quantity: 2 },
  ]));
  assert.equal(calculateCartSubtotalPaise([
    { price: 1, quantity: 100 },
  ]), 10_000);
});

test("fractional subtotals preserve the ₹149.99/₹150 boundary", () => {
  assert.equal(calculateOrderFees(149.99).customerPlatformFee, 30);
  assert.equal(calculateOrderFees(149.99).platformFee, 0);
  assert.equal(calculateOrderFees(150).customerPlatformFee, 0);
  assert.equal(calculateOrderFees(150).platformFee, 15);
});

test("paise line totals sum exactly to the persisted subtotal", () => {
  const cart = [
    { price: 12.34, quantity: 3 },
    { price: 0.01, quantity: 7 },
    { price: 149.99, quantity: 1 },
  ];
  const persistedLineTotals = cart.map((item) =>
    fromPaise(toPaise(item.price) * item.quantity),
  );
  const persistedSubtotal = fromPaise(calculateCartSubtotalPaise(cart));

  assert.equal(
    persistedLineTotals.reduce((sum, value) => sum + toPaise(value), 0),
    toPaise(persistedSubtotal),
  );
});

test("settlement totals exclude legacy fees and cancelled orders", () => {
  const summary = calculateCommissionSummary(
    [
      {
        status: "DELIVERED",
        feeModel: "OFFMENU_2026_10",
        subtotal: 200,
        customerPlatformFee: 0,
        platformFee: 20,
        deliveryFee: 0,
        total: 200,
      },
      {
        status: "DELIVERED",
        feeModel: "LEGACY",
        subtotal: 200,
        customerPlatformFee: 0,
        platformFee: 30,
        deliveryFee: 0,
        total: 200,
      },
      {
        status: "CANCELLED",
        feeModel: "OFFMENU_2026_10",
        subtotal: 200,
        customerPlatformFee: 0,
        platformFee: 20,
        deliveryFee: 0,
        total: 200,
      },
    ],
    500,
  );

  assert.equal(summary.commissionOwedPaise, 2_000);
  assert.equal(summary.legacyPlatformFeesPaise, 3_000);
  assert.equal(summary.commissionReceivedPaise, 500);
  assert.equal(summary.commissionOutstandingPaise, 1_500);
  assert.equal(summary.commissionOverpaymentPaise, 0);
});

test("settlement summary reports overpayments without negative balances", () => {
  const summary = calculateCommissionSummary(
    [
      {
        status: "ACCEPTED",
        feeModel: "OFFMENU_2026_10",
        subtotal: 150,
        customerPlatformFee: 0,
        platformFee: 15,
        deliveryFee: 0,
        total: 150,
      },
    ],
    2_000,
  );

  assert.equal(summary.commissionOutstandingPaise, 0);
  assert.equal(summary.commissionOverpaymentPaise, 500);
});

test("cart quantity actions support increment, decrement, and removal", () => {
  const cart = [{ menuItemId: 1, name: "Meal", price: 100, quantity: 1 }];
  assert.equal(changeCartQuantity(cart, 1, "add")[0].quantity, 2);
  assert.deepEqual(changeCartQuantity(cart, 1, "remove"), []);
  assert.deepEqual(changeCartQuantity(cart, 1, "delete"), []);
  assert.equal(
    changeCartQuantity([{ ...cart[0], quantity: 99 }], 1, "add")[0].quantity,
    99,
  );
});

test("cart reconciliation reports changed prices and unavailable items", () => {
  const cart = [
    { menuItemId: 1, name: "Meal", price: 100, quantity: 2 },
    { menuItemId: 2, name: "Drink", price: 20, quantity: 1 },
  ];
  const current = new Map([
    [1, { id: 1, name: "Meal", price: 110, isAvailable: true }],
    [2, { id: 2, name: "Drink", price: 20, isAvailable: false }],
  ]);
  const result = reconcileCart(cart, current);
  assert.equal(result.changed, true);
  assert.equal(result.updatedCart[0].price, 110);
  assert.deepEqual(result.unavailableNames, ["Drink"]);
});

test("cart reconciliation caps invalid legacy quantities and requires reconfirmation", () => {
  const result = reconcileCart(
    [{ menuItemId: 1, name: "Meal", price: 100, quantity: 120 }],
    new Map([[1, { id: 1, name: "Meal", price: 100, isAvailable: true }]]),
  );
  assert.equal(result.changed, true);
  assert.equal(result.updatedCart[0].quantity, 99);
});

test("confirmation token binds the reviewed cart and checkout details", () => {
  const snapshot = {
    restaurantId: 1,
    cart: [{ menuItemId: 4, name: "Meal", price: 100, quantity: 1 }],
    customerNote: null,
    deliveryAddress: "12 Example Road",
  };
  const original = orderConfirmationToken(snapshot);
  assert.equal(orderConfirmationToken(snapshot), original);
  assert.notEqual(orderConfirmationToken({ ...snapshot, cart: [{ ...snapshot.cart[0], price: 110 }] }), original);
  assert.notEqual(orderConfirmationToken({ ...snapshot, deliveryAddress: "13 Example Road" }), original);
});

test("WhatsApp signature verifier accepts authentic bodies and rejects tampering", () => {
  const body = '{"entry":[]}';
  const signature = `sha256=${createHmac("sha256", "unit-test-secret").update(body).digest("hex")}`;
  assert.equal(verifyWhatsappSignature(body, signature, "unit-test-secret"), true);
  assert.equal(verifyWhatsappSignature(`${body} `, signature, "unit-test-secret"), false);
  assert.equal(verifyWhatsappSignature(body, null, "unit-test-secret"), false);
});

test("WhatsApp API errors do not expose response bodies", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalMode = process.env.WHATSAPP_LOCAL_MODE;
  const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const originalPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  process.env.WHATSAPP_LOCAL_MODE = "false";
  process.env.WHATSAPP_ACCESS_TOKEN = "unit-test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "unit-test-phone-id";
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: { message: "sensitive provider detail" } }),
    { status: 401 },
  );

  try {
    await assert.rejects(sendText("+911234567890", "test"), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /status 401/);
      assert.doesNotMatch(error.message, /sensitive provider detail/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocalMode === undefined) delete process.env.WHATSAPP_LOCAL_MODE;
    else process.env.WHATSAPP_LOCAL_MODE = originalLocalMode;
    if (originalToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
    if (originalPhoneNumberId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhoneNumberId;
  }
});

test("WhatsApp local mode never reports a suppressed production send as successful", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalLocalMode = process.env.WHATSAPP_LOCAL_MODE;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  env.NODE_ENV = "production";
  process.env.WHATSAPP_LOCAL_MODE = "true";
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  };

  try {
    await assert.rejects(
      sendText("+911234567890", "private customer message"),
      /disabled in production/,
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalLocalMode === undefined) delete process.env.WHATSAPP_LOCAL_MODE;
    else process.env.WHATSAPP_LOCAL_MODE = originalLocalMode;
  }
});

test("WhatsApp local logging omits recipient and message content", async () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalLocalMode = process.env.WHATSAPP_LOCAL_MODE;
  const originalLog = console.info;
  const output: string[] = [];
  env.NODE_ENV = "test";
  process.env.WHATSAPP_LOCAL_MODE = "true";
  console.info = (...values: unknown[]) => output.push(values.join(" "));

  try {
    assert.deepEqual(
      await sendText("+911234567890", "private customer address"),
      { local: true },
    );
    assert.doesNotMatch(output.join(" "), /911234567890|private customer address/);
  } finally {
    console.info = originalLog;
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalLocalMode === undefined) delete process.env.WHATSAPP_LOCAL_MODE;
    else process.env.WHATSAPP_LOCAL_MODE = originalLocalMode;
  }
});

test("concurrent order confirmation claims create only one order", async () => {
  let sessionState = "WAITING_FOR_CONFIRMATION";
  let orderCount = 0;
  const claimAndCreate = () => runWithAtomicClaim(
    async () => {
      if (sessionState !== "WAITING_FOR_CONFIRMATION") return false;
      sessionState = "CREATING_ORDER";
      return true;
    },
    async () => {
      orderCount += 1;
      sessionState = "START";
      return orderCount;
    },
  );

  const outcomes = await Promise.all([claimAndCreate(), claimAndCreate()]);

  assert.equal(outcomes.filter((result) => result.claimed).length, 1);
  assert.equal(orderCount, 1);
});
