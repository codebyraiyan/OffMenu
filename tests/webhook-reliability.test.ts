import assert from "node:assert/strict";
import test from "node:test";
import {
  OutboxMessage,
  OutboxStore,
  MAX_OUTBOX_ATTEMPTS,
  outboxRetryDelayMs,
  processOutboxBatch,
} from "../lib/whatsapp-outbox";
import {
  InboundClaim,
  InboundMessageStore,
  processInboundMessage,
} from "../lib/webhook-idempotency";
import { transitionAndEnqueueNotification } from "../lib/order-notifications";

function makeInboxStore() {
  const records = new Map<string, { status: string; token: string }>();
  let cartQuantity = 0;
  let tokenSequence = 0;

  const store: InboundMessageStore = {
    async claim(messageId): Promise<InboundClaim> {
      const row = records.get(messageId);
      if (row?.status === "COMPLETED") return { kind: "duplicate" };
      if (row?.status === "PROCESSING") return { kind: "in_progress" };
      const token = `claim-${++tokenSequence}`;
      records.set(messageId, { status: "PROCESSING", token });
      return { kind: "claimed", token };
    },
    async processAtomically(messageId, token, process) {
      const row = records.get(messageId);
      if (!row || row.status !== "PROCESSING" || row.token !== token) {
        throw new Error("claim lost");
      }
      const originalQuantity = cartQuantity;
      try {
        const result = await process();
        records.set(messageId, { status: "COMPLETED", token });
        return result;
      } catch (error) {
        cartQuantity = originalQuantity;
        throw error;
      }
    },
    async markFailed(messageId, token) {
      const row = records.get(messageId);
      if (row?.token === token && row.status === "PROCESSING") {
        records.set(messageId, { status: "FAILED", token });
      }
    },
  };

  return {
    store,
    get cartQuantity() { return cartQuantity; },
    addCartItem() { cartQuantity += 1; },
  };
}

test("duplicate inbound events run effects only once", async () => {
  const inbox = makeInboxStore();
  let effectCount = 0;
  const process = () => processInboundMessage("wamid-duplicate", inbox.store, async () => {
    effectCount += 1;
    return "done";
  });

  assert.deepEqual(await process(), { kind: "processed", result: "done" });
  assert.deepEqual(await process(), { kind: "duplicate" });
  assert.equal(effectCount, 1);
});

test("failed inbound transaction retries without applying cart effects twice", async () => {
  const inbox = makeInboxStore();
  let attempts = 0;

  await assert.rejects(processInboundMessage("wamid-retry", inbox.store, async () => {
    attempts += 1;
    inbox.addCartItem();
    throw new Error("temporary DB failure");
  }));
  assert.equal(inbox.cartQuantity, 0);

  const retried = await processInboundMessage("wamid-retry", inbox.store, async () => {
    attempts += 1;
    inbox.addCartItem();
    return "done";
  });
  assert.deepEqual(retried, { kind: "processed", result: "done" });
  assert.equal(inbox.cartQuantity, 1);
  assert.equal(attempts, 2);
});

function makeOutboxStore(): OutboxStore & {
  messages: Array<OutboxMessage & { status: string; nextAttemptAt: Date; leaseExpiresAt?: Date }>;
} {
  const messages: Array<OutboxMessage & { status: string; nextAttemptAt: Date; leaseExpiresAt?: Date }> = [];
  let id = 0;
  let claim = 0;
  return {
    messages,
    async enqueue(message) {
      if (messages.some((row) => row.idempotencyKey === message.idempotencyKey)) return;
      messages.push({
        id: ++id,
        ...message,
        attemptCount: 0,
        claimToken: "",
        status: "PENDING",
        nextAttemptAt: message.now,
      });
    },
    async claim(now, leaseMs) {
      for (const row of messages) {
        if (
          row.status === "CLAIMED" &&
          row.leaseExpiresAt !== undefined &&
          row.leaseExpiresAt < now &&
          row.attemptCount >= MAX_OUTBOX_ATTEMPTS
        ) {
          row.status = "DEAD";
          row.claimToken = "";
          row.leaseExpiresAt = undefined;
        }
      }
      const row = messages.find((item) =>
        item.attemptCount < MAX_OUTBOX_ATTEMPTS && (
          ((item.status === "PENDING" || item.status === "FAILED") && item.nextAttemptAt <= now) ||
          (item.status === "CLAIMED" && item.leaseExpiresAt !== undefined && item.leaseExpiresAt < now)
        ),
      );
      if (!row) return null;
      row.status = "CLAIMED";
      row.attemptCount += 1;
      row.claimToken = `claim-${++claim}`;
      row.leaseExpiresAt = new Date(now.getTime() + leaseMs);
      return { ...row, payload: row.payload };
    },
    async markSent(id, token) {
      const row = messages.find((item) => item.id === id && item.claimToken === token);
      if (row) row.status = "SENT";
    },
    async markFailed(id, token, nextAttemptAt) {
      const row = messages.find((item) => item.id === id && item.claimToken === token);
      if (row) {
        row.status = row.attemptCount >= MAX_OUTBOX_ATTEMPTS ? "DEAD" : "FAILED";
        row.nextAttemptAt = nextAttemptAt;
        row.leaseExpiresAt = undefined;
      }
    },
  };
}

test("outbox enqueue is idempotent and claims retryable messages", async () => {
  const store = makeOutboxStore();
  const now = new Date("2026-10-28T00:00:00Z");
  const message = { idempotencyKey: "order:42:delivered", recipient: "test", payload: { type: "text" }, now };
  await store.enqueue(message);
  await store.enqueue(message);
  assert.equal(store.messages.length, 1);

  let attempts = 0;
  const first = await processOutboxBatch(store, async () => {
    attempts += 1;
    throw new Error("HTTP status 503");
  }, { now, limit: 1 });
  assert.deepEqual(first, { sent: 0, failed: 1 });
  assert.equal(store.messages[0].status, "FAILED");
  assert.equal(store.messages[0].attemptCount, 1);
  assert.equal(store.messages[0].nextAttemptAt.getTime(), now.getTime() + outboxRetryDelayMs(1));

  const beforeRetry = await processOutboxBatch(store, async () => {
    attempts += 1;
  }, { now: new Date(now.getTime() + 30_000), limit: 1 });
  assert.deepEqual(beforeRetry, { sent: 0, failed: 0 });

  const retry = await processOutboxBatch(store, async () => {
    attempts += 1;
  }, { now: new Date(now.getTime() + 60_000), limit: 1 });
  assert.deepEqual(retry, { sent: 1, failed: 0 });
  assert.equal(store.messages[0].status, "SENT");
  assert.equal(attempts, 2);
});

test("outbox stops retrying after the bounded attempt limit", async () => {
  const store = makeOutboxStore();
  let now = new Date("2026-10-28T00:00:00Z");
  await store.enqueue({
    idempotencyKey: "order:bounded-retry",
    recipient: "test",
    payload: { type: "text" },
    now,
  });

  for (let attempt = 1; attempt <= MAX_OUTBOX_ATTEMPTS; attempt += 1) {
    const result = await processOutboxBatch(store, async () => {
      throw new Error("HTTP status 503");
    }, { now, limit: 1 });
    assert.deepEqual(result, { sent: 0, failed: 1 });
    if (attempt < MAX_OUTBOX_ATTEMPTS) {
      now = new Date(store.messages[0].nextAttemptAt.getTime());
    }
  }

  assert.equal(store.messages[0].attemptCount, MAX_OUTBOX_ATTEMPTS);
  assert.equal(store.messages[0].status, "DEAD");
  const afterLimit = await processOutboxBatch(store, async () => {
    assert.fail("terminal message must not be sent again");
  }, { now: new Date(now.getTime() + 24 * 60 * 60 * 1000), limit: 1 });
  assert.deepEqual(afterLimit, { sent: 0, failed: 0 });
});

test("an expired final outbox claim becomes terminal without another send", async () => {
  const store = makeOutboxStore();
  const now = new Date("2026-10-28T00:00:00Z");
  store.messages.push({
    id: 99,
    idempotencyKey: "order:expired-final-claim",
    recipient: "test",
    payload: { type: "text" },
    attemptCount: MAX_OUTBOX_ATTEMPTS,
    claimToken: "expired-claim",
    status: "CLAIMED",
    nextAttemptAt: now,
    leaseExpiresAt: new Date(now.getTime() - 1),
  });

  const result = await processOutboxBatch(store, async () => {
    assert.fail("expired final claim must not be reclaimed");
  }, { now, limit: 1 });

  assert.deepEqual(result, { sent: 0, failed: 0 });
  assert.equal(store.messages[0].status, "DEAD");
});

test("a duplicate delivered transition does not enqueue a second confirmation", async () => {
  let status = "OUT_FOR_DELIVERY";
  let queued = 0;
  const transition = () => transitionAndEnqueueNotification(
    async () => {
      if (status !== "OUT_FOR_DELIVERY") return false;
      status = "DELIVERED";
      return true;
    },
    async () => { queued += 1; },
  );

  assert.equal(await transition(), true);
  assert.equal(await transition(), false);
  assert.equal(status, "DELIVERED");
  assert.equal(queued, 1);
});
