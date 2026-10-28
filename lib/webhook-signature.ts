import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWhatsappSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string,
) {
  if (!signature?.startsWith("sha256=")) return false;
  const receivedHex = signature.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const received = Buffer.from(receivedHex, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}
