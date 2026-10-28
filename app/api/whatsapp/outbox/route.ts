import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { DatabaseWhatsappOutboxStore, processOutboxBatch } from "@/lib/whatsapp-outbox";
import { sendWhatsappPayload } from "@/lib/whatsapp";

function hasValidWorkerToken(request: Request) {
  const expected = process.env.WHATSAPP_OUTBOX_WORKER_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes);
}

export async function POST(request: Request) {
  if (!process.env.WHATSAPP_OUTBOX_WORKER_TOKEN) {
    return NextResponse.json({ error: "Outbox worker is not configured." }, { status: 503 });
  }
  if (!hasValidWorkerToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processOutboxBatch(
      new DatabaseWhatsappOutboxStore(),
      sendWhatsappPayload,
      { limit: 20 },
    );
    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ error: "Outbox processing failed." }, { status: 500 });
  }
}
