
import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { migrateDatabase } from "./migration-runner";

const url = process.env.TURSO_DATABASE_URL;

if (!url) {
  throw new Error(
    "TURSO_DATABASE_URL is required for schema migration.",
  );
}

const isRemote = !url.startsWith("file:");

if (
  isRemote &&
  process.env.OFFMENU_REMOTE_MIGRATION_ACK !==
    "TARGET_AND_BACKUP_VERIFIED"
) {
  throw new Error(
    "Remote migration blocked. Verify the database target, schema, migration ledger, and backup, then set OFFMENU_REMOTE_MIGRATION_ACK explicitly.",
  );
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

function redactSecrets(message: string): string {
  const secrets = [
    process.env.TURSO_AUTH_TOKEN,
    process.env.TURSO_DATABASE_URL,
  ].filter((value): value is string => Boolean(value));

  return secrets.reduce(
    (safeMessage, secret) =>
      safeMessage.replaceAll(secret, "[REDACTED]"),
    message,
  );
}

async function main() {
  try {
    const bootstrapSql = readFileSync(
      resolve(process.cwd(), "drizzle/bootstrap.sql"),
      "utf8",
    );

    const result = await migrateDatabase(client, bootstrapSql);

    process.stdout.write(
      `Schema migration verified (${result.baseline}, ${result.version}).\n`,
    );
  } finally {
    client.close();
  }
}

main().catch((error: unknown) => {
  const details =
    error instanceof Error
      ? error.stack ?? error.message
      : String(error);

  process.stderr.write(
    `Schema migration failed:\n${redactSecrets(details)}\n`,
  );

  process.exitCode = 1;
});
