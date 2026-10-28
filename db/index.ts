import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { activeDatabaseTransaction } from "./context";

const url = process.env.TURSO_DATABASE_URL;

const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error("Missing TURSO_DATABASE_URL");
}

export const client = createClient({
  url,
  authToken
});

export const baseDb = drizzle(client);

export const db = new Proxy(baseDb, {
  get(target, property) {
    const transaction = activeDatabaseTransaction.getStore();

    if (property === "transaction" && transaction) {
      return (callback: (tx: typeof transaction) => unknown) =>
        callback(transaction);
    }

    const source = transaction ?? target;
    const value = Reflect.get(source, property, source);
    return typeof value === "function" ? value.bind(source) : value;
  },
}) as typeof baseDb;

export async function withDatabaseTransaction<T>(
  callback: () => Promise<T>,
): Promise<T> {
  if (activeDatabaseTransaction.getStore()) return callback();

  return baseDb.transaction(async (transaction) =>
    activeDatabaseTransaction.run(transaction, callback),
  );
}
