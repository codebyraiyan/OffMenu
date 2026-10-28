import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path.replace(/^\.\.\//, ""), "utf8");

function executableSql(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
}

test("migration journal entries resolve to ordered SQL and linked snapshots", () => {
  const journal = JSON.parse(read("../drizzle/meta/_journal.json")) as {
    entries: Array<{ idx: number; tag: string }>;
  };
  assert.deepEqual(journal.entries.map(({ idx }) => idx), [0, 1, 2, 3]);

  let previousId = "";
  for (const { tag } of journal.entries) {
    const snapshot = JSON.parse(read(`../drizzle/meta/${tag.slice(0, 4)}_snapshot.json`)) as {
      id: string;
      prevId: string;
    };
    assert.equal(snapshot.prevId, previousId, `${tag} snapshot predecessor`);
    previousId = snapshot.id;
    assert.ok(read(`../drizzle/${tag}.sql`).length > 0, `${tag} SQL exists`);
  }
});

test("historical Drizzle migrations are incomplete and require the compatibility runner", () => {
  const sql0 = executableSql(read("../drizzle/0000_military_vision.sql"));
  const sql1 = executableSql(read("../drizzle/0001_add_restaurant_is_active.sql"));
  const sql2 = executableSql(read("../drizzle/0002_add_commission_accounting.sql"));
  const sql3 = executableSql(read("../drizzle/0003_whatsapp_reliability.sql"));

  assert.doesNotMatch(sql0, /CREATE\s+TABLE/i);
  assert.match(sql1, /ALTER\s+TABLE\s+`restaurants`[\s\S]*ADD\s+`is_active`/i);
  assert.doesNotMatch(sql1, /username|password_hash|delivery_fee/i);
  assert.match(sql2, /ADD\s+`fee_model`/i);
  assert.match(sql2, /CREATE\s+TABLE\s+`commission_settlements`/i);
  assert.doesNotMatch(sql2, /customer_platform_fee|delivery_fee/i);

  assert.match(sql3, /CREATE\s+TABLE\s+`whatsapp_outbox`/i);
  assert.match(sql3, /CREATE\s+UNIQUE\s+INDEX\s+`whatsapp_outbox_idempotency_unique`/i);
  assert.match(sql3, /CREATE\s+INDEX\s+`whatsapp_outbox_delivery_idx`/i);
  for (const column of ["status", "attempt_count", "claim_token", "lease_expires_at", "completed_at", "last_error"]) {
    assert.match(sql3, new RegExp("ADD\\s+`" + column + "`", "i"));
  }
});

test("canonical bootstrap SQL includes every current fee field and matches the terminal snapshot", () => {
  const schema = read("../db/schema.ts");
  const bootstrap = executableSql(read("../drizzle/bootstrap.sql"));
  const feeMigrationSql = [1, 2, 3]
    .map((index) => executableSql(read(`../drizzle/000${index}_${index === 1 ? "add_restaurant_is_active" : index === 2 ? "add_commission_accounting" : "whatsapp_reliability"}.sql`)))
    .join("\n");

  assert.match(schema, /deliveryFee:\s*real\("delivery_fee"\)/);
  assert.match(schema, /customerPlatformFee:\s*real\("customer_platform_fee"\)/);
  assert.match(schema, /feeModel:\s*text\("fee_model"\)/);
  assert.doesNotMatch(feeMigrationSql, /ADD\s+`delivery_fee`/i);
  assert.doesNotMatch(feeMigrationSql, /ADD\s+`customer_platform_fee`/i);
  for (const column of ["delivery_fee", "customer_platform_fee", "fee_model"]) {
    assert.match(bootstrap, new RegExp("`" + column + "`", "i"));
  }

  const terminalSnapshot = JSON.parse(read("../drizzle/meta/0003_snapshot.json")) as {
    tables: Record<string, { columns: Record<string, unknown>; indexes: Record<string, unknown> }>;
  };
  const bootstrapTables = new Map<string, string[]>();
  const bootstrapIndexes: string[] = [];
  for (const statement of bootstrap.split(";").map((part) => part.trim())) {
    const table = statement.match(/^CREATE TABLE `([^`]+)`\s*\(([\s\S]*)\)$/i);
    if (table) {
      bootstrapTables.set(
        table[1],
        [...table[2].matchAll(/^\s*`([^`]+)`\s+[a-z]+/gim)].map((match) => match[1]).sort(),
      );
    }
    const index = statement.match(/^CREATE (?:UNIQUE )?INDEX `([^`]+)`/i);
    if (index) bootstrapIndexes.push(index[1]);
  }
  assert.deepEqual([...bootstrapTables.keys()].sort(), Object.keys(terminalSnapshot.tables).sort());
  for (const [name, columns] of bootstrapTables) {
    assert.deepEqual(columns, Object.keys(terminalSnapshot.tables[name].columns).sort(), `${name} columns`);
  }
  const snapshotIndexes = Object.values(terminalSnapshot.tables)
    .flatMap((table) => Object.keys(table.indexes))
    .sort();
  assert.deepEqual(bootstrapIndexes.sort(), snapshotIndexes, "terminal snapshot indexes");
});
