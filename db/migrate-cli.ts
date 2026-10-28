import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";
import { migrateDatabase } from "./migration-runner";

const url = process.env.TURSO_DATABASE_URL;
if (!url) throw new Error("TURSO_DATABASE_URL is required for schema migration.");

const isRemote = !url.startsWith("file:");
if (
  isRemote &&
  process.env.OFFMENU_REMOTE_MIGRATION_ACK !== "TARGET_AND_BACKUP_VERIFIED"
) {
  throw new Error(
    "Remote migration blocked. Verify the database target, schema, migration ledger, and backup, then set OFFMENU_REMOTE_MIGRATION_ACK explicitly.",
  );
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  try {
    const bootstrapSql = readFileSync(resolve(process.cwd(), "drizzle/bootstrap.sql"), "utf8");
    const result = await migrateDatabase(client, bootstrapSql);
    process.stdout.write(`Schema migration verified (${result.baseline}, ${result.version}).\n`);
  } finally {
    client.close();
  }
}

main().catch(() => {
  process.stderr.write("Schema migration failed; inspect the local error with credentials redacted.\n");
  process.exitCode = 1;
});
