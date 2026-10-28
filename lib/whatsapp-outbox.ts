import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  inArray,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { whatsappOutbox } from "@/db/schema";

export type WhatsappPayload = Record<string, unknown>;

export type OutboxMessage = {
  id: number;
  idempotencyKey: string;
  recipient: string;
  payload: WhatsappPayload;
  attemptCount: number;
  claimToken: string;
};

export const MAX_OUTBOX_ATTEMPTS = 10;

export type OutboxStore = {
  enqueue: (message: {
    idempotencyKey: string;
    recipient: string;
    payload: WhatsappPayload;
    now: Date;
  }) => Promise<void>;
  claim: (now: Date, leaseMs: number) => Promise<OutboxMessage | null>;
  markSent: (id: number, claimToken: string, sentAt: Date) => Promise<void>;
  markFailed: (
    id: number,
    claimToken: string,
    nextAttemptAt: Date,
    reason: string,
  ) => Promise<void>;
};

const inboundContext = new AsyncLocalStorage<{
  messageId: string;
  sequence: number;
}>();

export function withInboundOutboxContext<T>(
  messageId: string,
  callback: () => Promise<T>,
) {
  return inboundContext.run({ messageId, sequence: 0 }, callback);
}

export async function enqueueWhatsappMessage(
  idempotencyKey: string,
  recipient: string,
  payload: WhatsappPayload,
) {
  const { db } = await import("@/db");
  await db.insert(whatsappOutbox).values({
    idempotencyKey,
    recipient,
    payload: JSON.stringify(payload),
    status: "PENDING",
    attemptCount: 0,
    nextAttemptAt: new Date(),
    createdAt: new Date(),
  }).onConflictDoNothing({ target: whatsappOutbox.idempotencyKey });
}

export async function enqueueInboundWhatsappMessage(
  recipient: string,
  payload: WhatsappPayload,
) {
  const context = inboundContext.getStore();
  if (!context) return false;

  const idempotencyKey = `inbound:${context.messageId}:${context.sequence++}`;
  await enqueueWhatsappMessage(idempotencyKey, recipient, payload);
  return true;
}

function eligibleOutboxRows(now: Date) {
  return or(
    and(
      inArray(whatsappOutbox.status, ["PENDING", "FAILED"]),
      lte(whatsappOutbox.nextAttemptAt, now),
      lt(whatsappOutbox.attemptCount, MAX_OUTBOX_ATTEMPTS),
    ),
    and(
      eq(whatsappOutbox.status, "CLAIMED"),
      lt(whatsappOutbox.leaseExpiresAt, now),
      lt(whatsappOutbox.attemptCount, MAX_OUTBOX_ATTEMPTS),
    ),
  );
}

export class DatabaseWhatsappOutboxStore implements OutboxStore {
  async enqueue(message: {
    idempotencyKey: string;
    recipient: string;
    payload: WhatsappPayload;
    now: Date;
  }) {
    const { db } = await import("@/db");
    await db.insert(whatsappOutbox).values({
      ...message,
      payload: JSON.stringify(message.payload),
      status: "PENDING",
      attemptCount: 0,
      nextAttemptAt: message.now,
      createdAt: message.now,
    }).onConflictDoNothing({ target: whatsappOutbox.idempotencyKey });
  }

  async claim(now: Date, leaseMs: number) {
    const { db } = await import("@/db");
    return db.transaction(async (tx) => {
      await tx
        .update(whatsappOutbox)
        .set({
          status: "DEAD",
          claimToken: null,
          leaseExpiresAt: null,
          lastError: "Delivery attempt limit reached.",
        })
        .where(and(
          eq(whatsappOutbox.status, "CLAIMED"),
          lt(whatsappOutbox.leaseExpiresAt, now),
          sql`${whatsappOutbox.attemptCount} >= ${MAX_OUTBOX_ATTEMPTS}`,
        ));

      const candidate = await tx
        .select({ id: whatsappOutbox.id })
        .from(whatsappOutbox)
        .where(eligibleOutboxRows(now))
        .orderBy(asc(whatsappOutbox.createdAt), asc(whatsappOutbox.id))
        .limit(1);
      if (!candidate[0]) return null;

      const claimToken = randomUUID();
      const rows = await tx
        .update(whatsappOutbox)
        .set({
          status: "CLAIMED",
          attemptCount: sql`${whatsappOutbox.attemptCount} + 1`,
          claimToken,
          leaseExpiresAt: new Date(now.getTime() + leaseMs),
          lastError: null,
        })
        .where(and(
          eq(whatsappOutbox.id, candidate[0].id),
          eligibleOutboxRows(now),
        ))
        .returning();

      const row = rows[0];
      if (!row) return null;

      return {
        id: row.id,
        idempotencyKey: row.idempotencyKey,
        recipient: row.recipient,
        payload: JSON.parse(row.payload) as WhatsappPayload,
        attemptCount: row.attemptCount,
        claimToken,
      };
    });
  }

  async markSent(id: number, claimToken: string, sentAt: Date) {
    const { db } = await import("@/db");
    await db.update(whatsappOutbox)
      .set({
        status: "SENT",
        sentAt,
        claimToken: null,
        leaseExpiresAt: null,
        lastError: null,
      })
      .where(and(
        eq(whatsappOutbox.id, id),
        eq(whatsappOutbox.status, "CLAIMED"),
        eq(whatsappOutbox.claimToken, claimToken),
      ));
  }

  async markFailed(
    id: number,
    claimToken: string,
    nextAttemptAt: Date,
    reason: string,
  ) {
    const { db } = await import("@/db");
    await db.update(whatsappOutbox)
      .set({
        status: sql`CASE WHEN ${whatsappOutbox.attemptCount} >= ${MAX_OUTBOX_ATTEMPTS} THEN 'DEAD' ELSE 'FAILED' END`,
        nextAttemptAt,
        claimToken: null,
        leaseExpiresAt: null,
        lastError: reason,
      })
      .where(and(
        eq(whatsappOutbox.id, id),
        eq(whatsappOutbox.status, "CLAIMED"),
        eq(whatsappOutbox.claimToken, claimToken),
      ));
  }
}

export function outboxRetryDelayMs(attemptCount: number) {
  const exponent = Math.min(Math.max(attemptCount - 1, 0), 8);
  return Math.min(60_000 * 2 ** exponent, 6 * 60 * 60 * 1000);
}

function safeFailureReason(error: unknown) {
  if (error instanceof Error) {
    const status = error.message.match(/\bstatus (\d{3})\b/i)?.[1];
    if (status) return `WhatsApp API returned HTTP ${status}.`;
  }
  return "WhatsApp delivery failed.";
}

export async function processOutboxBatch(
  store: OutboxStore,
  send: (recipient: string, payload: WhatsappPayload) => Promise<unknown>,
  options: { now?: Date; limit?: number; leaseMs?: number } = {},
) {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 10;
  const leaseMs = options.leaseMs ?? 2 * 60 * 1000;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < limit; i += 1) {
    const message = await store.claim(now, leaseMs);
    if (!message) break;

    try {
      await send(message.recipient, message.payload);
      await store.markSent(message.id, message.claimToken, now);
      sent += 1;
    } catch (error) {
      await store.markFailed(
        message.id,
        message.claimToken,
        new Date(now.getTime() + outboxRetryDelayMs(message.attemptCount)),
        safeFailureReason(error),
      );
      failed += 1;
    }
  }

  return { sent, failed };
}
