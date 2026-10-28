export type InboundClaim =
  | { kind: "claimed"; token: string }
  | { kind: "duplicate" | "in_progress" };

export type InboundMessageStore = {
  claim: (messageId: string) => Promise<InboundClaim>;
  processAtomically: <T>(
    messageId: string,
    token: string,
    process: () => Promise<T>,
  ) => Promise<T>;
  markFailed: (messageId: string, token: string) => Promise<void>;
};

export async function runWithAtomicClaim<T>(
  claim: () => Promise<boolean>,
  process: () => Promise<T>,
): Promise<{ claimed: false } | { claimed: true; result: T }> {
  if (!(await claim())) return { claimed: false };
  return { claimed: true, result: await process() };
}

export async function processInboundMessage<T>(
  messageId: string,
  store: InboundMessageStore,
  process: () => Promise<T>,
) {
  const claim = await store.claim(messageId);
  if (claim.kind !== "claimed") return { ...claim } as const;

  try {
    const result = await store.processAtomically(
      messageId,
      claim.token,
      process,
    );
    return { kind: "processed" as const, result };
  } catch (error) {
    await store.markFailed(messageId, claim.token);
    throw error;
  }
}
