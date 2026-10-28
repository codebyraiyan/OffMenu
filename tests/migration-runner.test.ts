
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createClient } from "@libsql/client";
import { migrateDatabase } from "../db/migration-runner";

const read = (file: string) =>
  readFile(path.join(process.cwd(), file), "utf8");

async function withDatabase<T>(
  run: (client: ReturnType<typeof createClient>) => Promise<T>,
) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "offmenu-schema-test-"),
  );
  const client = createClient({
    url: `file:${path.join(directory, "fixture.db")}`,
  });

  try {
    return await run(client);
  } finally {
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
}

async function migrate(client: ReturnType<typeof createClient>) {
  return migrateDatabase(client, await read("drizzle/bootstrap.sql"));
}

async function tableNames(client: ReturnType<typeof createClient>) {
  const result = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return result.rows.map((row) => String(row.name));
}

async function columns(
  client: ReturnType<typeof createClient>,
  table: string,
) {
  const result = await client.execute(`PRAGMA table_info(\`${table}\`)`);
  return result.rows.map((row) => String(row.name));
}

async function indexes(
  client: ReturnType<typeof createClient>,
  table: string,
) {
  const result = await client.execute(`PRAGMA index_list(\`${table}\`)`);
  return result.rows.map((row) => String(row.name));
}

async function foreignKeyViolations(
  client: ReturnType<typeof createClient>,
) {
  const result = await client.execute("PRAGMA foreign_key_check");
  return result.rows;
}

test("fresh database bootstraps canonical tables, columns, indexes, and metadata", async () => {
  await withDatabase(async (client) => {
    assert.deepEqual(await migrate(client), {
      baseline: "fresh",
      version: "canonical-v1",
    });

    assert.deepEqual(await tableNames(client), [
      "_offmenu_schema_migrations",
      "categories",
      "commission_settlements",
      "menu_items",
      "order_items",
      "orders",
      "processed_whatsapp_messages",
      "restaurant_daily_order_counters",
      "restaurants",
      "whatsapp_outbox",
      "whatsapp_sessions",
    ]);

    assert.ok((await columns(client, "orders")).includes("customer_platform_fee"));
    assert.ok((await columns(client, "orders")).includes("delivery_fee"));
    assert.ok((await columns(client, "orders")).includes("fee_model"));
    assert.ok((await columns(client, "processed_whatsapp_messages")).includes("claim_token"));
    assert.ok((await columns(client, "whatsapp_outbox")).includes("lease_expires_at"));

    assert.ok(
      (await indexes(client, "commission_settlements")).includes(
        "commission_settlements_idempotency_unique",
      ),
    );
    assert.ok(
      (await indexes(client, "whatsapp_outbox")).includes(
        "whatsapp_outbox_delivery_idx",
      ),
    );

    const ledger = await client.execute(
      "SELECT version, checksum FROM _offmenu_schema_migrations",
    );
    assert.equal(ledger.rows.length, 1);
    assert.equal(ledger.rows[0].version, "canonical-v1");

    const before = await tableNames(client);
    await migrate(client);
    assert.deepEqual(await tableNames(client), before);

    const afterRerun = await client.execute(
      "SELECT version FROM _offmenu_schema_migrations",
    );
    assert.equal(afterRerun.rows.length, 1);
  });
});

test("representative legacy schema upgrades additively and preserves historical order amounts", async () => {
  await withDatabase(async (client) => {
    const baseMigration = await read("drizzle/0000_military_vision.sql");
    const baseDdl = baseMigration.match(/\/\*([\s\S]*?)\*\//)?.[1];

    assert.ok(
      baseDdl,
      "legacy base DDL fixture exists in the historical migration",
    );

    for (const statement of baseDdl
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await client.execute(statement);
    }

    await client.execute(
      await read("drizzle/0001_add_restaurant_is_active.sql"),
    );

    await client.execute(
      "ALTER TABLE orders ADD COLUMN delivery_fee real DEFAULT 0 NOT NULL",
    );
    await client.execute(
      "ALTER TABLE orders ADD COLUMN customer_platform_fee real DEFAULT 0 NOT NULL",
    );

    await client.execute({
      sql: "INSERT INTO restaurants (name, phone, area, is_open, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["Fixture", "0000000000", "Test Area", 1, 1, 1],
    });

    await client.execute({
      sql: "INSERT INTO orders (order_number, restaurant_id, customer_phone, delivery_address, subtotal, platform_fee, total, payment_method, status, created_at) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [
        "LEGACY-1",
        "0000000000",
        "Fixture address",
        149,
        30,
        179,
        "COD_OR_UPI",
        "PLACED",
        1,
      ],
    });

    assert.deepEqual(await migrate(client), {
      baseline: "legacy",
      version: "canonical-v1",
    });

    const historical = await client.execute(
      "SELECT subtotal, platform_fee, total, delivery_fee, customer_platform_fee, fee_model FROM orders WHERE order_number = 'LEGACY-1'",
    );

    assert.deepEqual(
      { ...historical.rows[0] },
      {
        subtotal: 149,
        platform_fee: 30,
        total: 179,
        delivery_fee: 0,
        customer_platform_fee: 0,
        fee_model: "LEGACY",
      },
    );

    assert.ok((await columns(client, "restaurants")).includes("password_hash"));
    assert.ok((await columns(client, "processed_whatsapp_messages")).includes("completed_at"));
    assert.ok((await tableNames(client)).includes("whatsapp_outbox"));

    assert.deepEqual(await migrate(client), {
      baseline: "legacy",
      version: "canonical-v1",
    });
  });
});

test("legacy migration preserves pre-existing orphaned order items without introducing new violations", async () => {
  await withDatabase(async (client) => {
    const baseMigration = await read("drizzle/0000_military_vision.sql");
    const baseDdl = baseMigration.match(/\/\*([\s\S]*?)\*\//)?.[1];

    assert.ok(baseDdl, "legacy base DDL fixture exists");

    for (const statement of baseDdl
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await client.execute(statement);
    }

    await client.execute(
      await read("drizzle/0001_add_restaurant_is_active.sql"),
    );
    await client.execute(
      "ALTER TABLE orders ADD COLUMN delivery_fee real DEFAULT 0 NOT NULL",
    );
    await client.execute(
      "ALTER TABLE orders ADD COLUMN customer_platform_fee real DEFAULT 0 NOT NULL",
    );

    await client.execute({
      sql: "INSERT INTO restaurants (name, phone, area, is_open, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["Fixture", "0000000000", "Test Area", 1, 1, 1],
    });

    await client.execute({
      sql: "INSERT INTO menu_items (restaurant_id, name, price, is_available, created_at) VALUES (1, ?, ?, ?, ?)",
      args: ["Preserved test item", 69, 1, 1],
    });

    // Simulate an existing legacy violation. SQLite will not let us insert
    // the orphan while foreign-key enforcement is enabled.
    await client.execute("PRAGMA foreign_keys = OFF");

    try {
      await client.execute({
        sql: "INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)",
        args: [999, 1, "Preserved test item", 1, 69, 69],
      });
    } finally {
      await client.execute("PRAGMA foreign_keys = ON");
    }

    const violationsBefore = await foreignKeyViolations(client);
    assert.equal(violationsBefore.length, 1);

    const itemBefore = await client.execute(
      "SELECT id, order_id, menu_item_id, item_name, quantity, unit_price, total FROM order_items WHERE order_id = 999",
    );
    assert.equal(itemBefore.rows.length, 1);

    assert.deepEqual(await migrate(client), {
      baseline: "legacy",
      version: "canonical-v1",
    });

    const itemAfter = await client.execute(
      "SELECT id, order_id, menu_item_id, item_name, quantity, unit_price, total FROM order_items WHERE order_id = 999",
    );

    assert.deepEqual({ ...itemAfter.rows[0] }, { ...itemBefore.rows[0] });

    const violationsAfter = await foreignKeyViolations(client);

    assert.deepEqual(
      violationsAfter.map((row) => ({
        table: row.table,
        rowid: row.rowid,
        parent: row.parent,
        fkid: row.fkid,
      })),
      violationsBefore.map((row) => ({
        table: row.table,
        rowid: row.rowid,
        parent: row.parent,
        fkid: row.fkid,
      })),
    );
  });
});

test("partial schemas fail without leaving migration changes behind", async () => {
  await withDatabase(async (client) => {
    await client.execute("CREATE TABLE restaurants (id integer PRIMARY KEY)");

    await assert.rejects(
      migrate(client),
      /Incompatible partial schema; missing base tables/,
    );

    assert.deepEqual(await tableNames(client), ["restaurants"]);
  });
});

test("incompatible core columns fail before any migration writes", async () => {
  await withDatabase(async (client) => {
    await client.execute("CREATE TABLE restaurants (id text PRIMARY KEY)");

    await assert.rejects(migrate(client), /Incompatible partial schema/);

    assert.deepEqual(await tableNames(client), ["restaurants"]);
  });
});
