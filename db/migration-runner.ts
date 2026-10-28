
import { createHash } from "node:crypto";
import type { Client, Transaction } from "@libsql/client";

const migrationVersion = "canonical-v1";
const ledgerTable = "_offmenu_schema_migrations";

type SqlRow = Record<string, unknown>;
type ColumnDefinition = { name: string; type: string };

type IndexDefinition = {
  name: string;
  table: string;
  unique: boolean;
  columns: string[];
  sql: string;
};

type ForeignKeyDefinition = {
  table: string;
  from: string;
  to: string;
  onDelete: string;
};

type ForeignKeyViolation = {
  table: string;
  rowid: string;
  parent: string;
  fkid: string;
};

const legacyTables = [
  "categories",
  "menu_items",
  "orders",
  "order_items",
  "restaurants",
  "whatsapp_sessions",
  "processed_whatsapp_messages",
  "restaurant_daily_order_counters",
];

const safeAdditions: Record<
  string,
  Array<{
    name: string;
    sql: string;
    notNull: boolean;
    defaultValue: string | null;
  }>
> = {
  restaurants: [
    {
      name: "username",
      sql: "`username` text",
      notNull: false,
      defaultValue: null,
    },
    {
      name: "password_hash",
      sql: "`password_hash` text",
      notNull: false,
      defaultValue: null,
    },
    {
      name: "is_active",
      sql: "`is_active` integer DEFAULT true NOT NULL",
      notNull: true,
      defaultValue: "1",
    },
  ],
  orders: [
    {
      name: "delivery_fee",
      sql: "`delivery_fee` real DEFAULT 0 NOT NULL",
      notNull: true,
      defaultValue: "0",
    },
    {
      name: "customer_platform_fee",
      sql: "`customer_platform_fee` real DEFAULT 0 NOT NULL",
      notNull: true,
      defaultValue: "0",
    },
    {
      name: "fee_model",
      sql: "`fee_model` text DEFAULT 'LEGACY' NOT NULL",
      notNull: true,
      defaultValue: "LEGACY",
    },
  ],
  processed_whatsapp_messages: [
    {
      name: "status",
      sql: "`status` text DEFAULT 'COMPLETED' NOT NULL",
      notNull: true,
      defaultValue: "COMPLETED",
    },
    {
      name: "attempt_count",
      sql: "`attempt_count` integer DEFAULT 0 NOT NULL",
      notNull: true,
      defaultValue: "0",
    },
    {
      name: "claim_token",
      sql: "`claim_token` text",
      notNull: false,
      defaultValue: null,
    },
    {
      name: "lease_expires_at",
      sql: "`lease_expires_at` integer",
      notNull: false,
      defaultValue: null,
    },
    {
      name: "completed_at",
      sql: "`completed_at` integer",
      notNull: false,
      defaultValue: null,
    },
    {
      name: "last_error",
      sql: "`last_error` text",
      notNull: false,
      defaultValue: null,
    },
  ],
};

function splitSqlList(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (quote) {
      if (char === quote && value[index + 1] === quote) {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts;
}

function parseCanonicalSql(sql: string) {
  const tables = new Map<string, ColumnDefinition[]>();
  const foreignKeys = new Map<string, ForeignKeyDefinition[]>();
  const tableStatements = new Map<string, string>();
  const indexes: IndexDefinition[] = [];

  for (const statement of sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    const tableMatch = statement.match(
      /^CREATE TABLE `([^`]+)`\s*\(([\s\S]*)\)$/i,
    );

    if (tableMatch) {
      const [, table, body] = tableMatch;
      const columns: ColumnDefinition[] = [];
      const references: ForeignKeyDefinition[] = [];

      for (const part of splitSqlList(body)) {
        const column = part.match(/^`([^`]+)`\s+([a-z]+)/i);

        if (column) {
          columns.push({
            name: column[1],
            type: column[2].toUpperCase(),
          });
        }

        const foreign = part.match(
          /FOREIGN KEY\s*\(`([^`]+)`\)\s+REFERENCES\s+`([^`]+)`\(`([^`]+)`\)[\s\S]*?ON DELETE (cascade|set null|no action)/i,
        );

        if (foreign) {
          references.push({
            from: foreign[1],
            table: foreign[2],
            to: foreign[3],
            onDelete: foreign[4].toUpperCase(),
          });
        }
      }

      tables.set(table, columns);
      foreignKeys.set(table, references);
      tableStatements.set(table, `${statement};`);
      continue;
    }

    const indexMatch = statement.match(
      /^CREATE (UNIQUE )?INDEX `([^`]+)` ON `([^`]+)`\s*\(([^)]+)\)$/i,
    );

    if (indexMatch) {
      indexes.push({
        unique: Boolean(indexMatch[1]),
        name: indexMatch[2],
        table: indexMatch[3],
        columns: indexMatch[4]
          .split(",")
          .map((column) => column.trim().replaceAll("`", "")),
        sql: `${statement};`,
      });
    }
  }

  return { tables, tableStatements, indexes, foreignKeys };
}

async function rows(transaction: Transaction, sql: string) {
  const result = await transaction.execute(sql);
  return result.rows as unknown as SqlRow[];
}

async function existingTables(transaction: Transaction) {
  const found = await rows(
    transaction,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );

  return new Set(found.map((row) => String(row.name)));
}

async function tableColumns(transaction: Transaction, table: string) {
  return rows(transaction, `PRAGMA table_info(\`${table}\`)`);
}

function normalizeType(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeDefault(value: unknown) {
  if (value === null || value === undefined) return null;

  const normalized = String(value)
    .trim()
    .replace(/^\((.*)\)$/, "$1")
    .replace(/^['"]|['"]$/g, "");

  if (normalized.toLowerCase() === "true") return "1";
  if (normalized.toLowerCase() === "false") return "0";

  return normalized;
}

async function verifyTableColumns(
  transaction: Transaction,
  expectedTables: Map<string, ColumnDefinition[]>,
  options: { legacy?: boolean } = {},
) {
  for (const [table, columns] of expectedTables) {
    const existing = await tableColumns(transaction, table);
    const byName = new Map(
      existing.map((column) => [String(column.name), column]),
    );

    if (existing.length === 0) {
      throw new Error(`Required table is missing: ${table}.`);
    }

    for (const column of columns) {
      const found = byName.get(column.name);

      if (!found) {
        if (
          options.legacy &&
          safeAdditions[table]?.some((item) => item.name === column.name)
        ) {
          continue;
        }

        throw new Error(`Required column is missing: ${table}.${column.name}.`);
      }

      if (normalizeType(found.type) !== column.type) {
        throw new Error(
          `Incompatible column type: ${table}.${column.name}.`,
        );
      }
    }
  }
}

async function verifyForeignKeys(
  transaction: Transaction,
  expectedForeignKeys: Map<string, ForeignKeyDefinition[]>,
) {
  for (const [table, expected] of expectedForeignKeys) {
    const actual = await rows(
      transaction,
      `PRAGMA foreign_key_list(\`${table}\`)`,
    );

    for (const key of expected) {
      const exists = actual.some(
        (row) =>
          String(row.table) === key.table &&
          String(row.from) === key.from &&
          String(row.to) === key.to &&
          normalizeType(row.on_delete) === key.onDelete,
      );

      if (!exists) {
        throw new Error(`Incompatible foreign key on ${table}.${key.from}.`);
      }
    }
  }
}

async function getForeignKeyViolations(
  transaction: Transaction,
): Promise<ForeignKeyViolation[]> {
  const result = await rows(transaction, "PRAGMA foreign_key_check");

  return result.map((row) => ({
    table: String(row.table),
    rowid: String(row.rowid),
    parent: String(row.parent),
    fkid: String(row.fkid),
  }));
}

function violationKey(violation: ForeignKeyViolation) {
  return JSON.stringify([
    violation.table,
    violation.rowid,
    violation.parent,
    violation.fkid,
  ]);
}

/**
 * Rejects any violation not present in the baseline snapshot.
 * Multiplicity is counted, so an additional duplicate violation is rejected.
 */
function assertNoNewForeignKeyViolations(
  baseline: ForeignKeyViolation[],
  current: ForeignKeyViolation[],
) {
  const remainingBaselineCounts = new Map<string, number>();

  for (const violation of baseline) {
    const key = violationKey(violation);
    remainingBaselineCounts.set(
      key,
      (remainingBaselineCounts.get(key) ?? 0) + 1,
    );
  }

  const newViolations: ForeignKeyViolation[] = [];

  for (const violation of current) {
    const key = violationKey(violation);
    const remaining = remainingBaselineCounts.get(key) ?? 0;

    if (remaining > 0) {
      remainingBaselineCounts.set(key, remaining - 1);
    } else {
      newViolations.push(violation);
    }
  }

  if (newViolations.length > 0) {
    const details = newViolations
      .map(
        (item) =>
          `${item.table} rowid=${item.rowid} parent=${item.parent} fkid=${item.fkid}`,
      )
      .join("; ");

    throw new Error(
      `Migration introduced new foreign-key violations; the migration was rolled back. ${details}`,
    );
  }

  const remaining = [...remainingBaselineCounts.values()].reduce(
    (sum, count) => sum + count,
    0,
  );

  if (remaining > 0) {
    throw new Error(
      "Existing foreign-key violations changed during migration; the migration was rolled back.",
    );
  }
}

async function ensureIndexes(
  transaction: Transaction,
  indexes: IndexDefinition[],
) {
  for (const index of indexes) {
    const listed = await rows(
      transaction,
      `PRAGMA index_list(\`${index.table}\`)`,
    );

    const existing = listed.find(
      (row) => String(row.name) === index.name,
    );

    if (!existing) {
      await transaction.execute(index.sql);
      continue;
    }

    const columns = await rows(
      transaction,
      `PRAGMA index_info(\`${index.name}\`)`,
    );

    const actualColumns = columns
      .sort((left, right) => Number(left.seqno) - Number(right.seqno))
      .map((column) => String(column.name));

    if (
      Number(existing.unique) !== Number(index.unique) ||
      actualColumns.length !== index.columns.length ||
      actualColumns.some(
        (column, position) => column !== index.columns[position],
      )
    ) {
      throw new Error(`Incompatible index definition: ${index.name}.`);
    }
  }
}

async function verifyMigrationLedger(
  transaction: Transaction,
  checksum: string,
) {
  const tables = await existingTables(transaction);

  if (!tables.has(ledgerTable)) return false;

  const columns = await tableColumns(transaction, ledgerTable);
  const names = new Set(columns.map((column) => String(column.name)));

  for (const name of ["version", "checksum", "applied_at"]) {
    if (!names.has(name)) {
      throw new Error("Incompatible OffMenu migration ledger.");
    }
  }

  const entries = await rows(
    transaction,
    `SELECT version, checksum FROM \`${ledgerTable}\``,
  );

  for (const entry of entries) {
    if (
      entry.version !== migrationVersion ||
      entry.checksum !== checksum
    ) {
      throw new Error(
        "Unknown OffMenu migration ledger entry; manual review is required.",
      );
    }
  }

  return true;
}

async function verifyFinalMigrationLedger(
  transaction: Transaction,
  checksum: string,
) {
  const entries = await rows(
    transaction,
    `SELECT version, checksum FROM \`${ledgerTable}\``,
  );

  if (
    entries.length !== 1 ||
    entries[0].version !== migrationVersion ||
    entries[0].checksum !== checksum
  ) {
    throw new Error(
      "Migration ledger verification failed; the migration was rolled back.",
    );
  }
}

/**
 * Initializes an empty database or additively reconciles the known legacy
 * application schema. Existing data violations are preserved as a baseline;
 * the migration may not introduce new violations or alter that baseline.
 */
export async function migrateDatabase(
  client: Client,
  bootstrapSql: string,
) {
  const checksum = createHash("sha256")
    .update(bootstrapSql)
    .digest("hex");

  const canonical = parseCanonicalSql(bootstrapSql);

  await client.execute("PRAGMA foreign_keys = ON");
  const transaction = await client.transaction("write");

  try {
    const knownTables = await existingTables(transaction);
    const applicationTables = new Set(
      [...knownTables].filter((table) => table !== ledgerTable),
    );

    const isFresh = applicationTables.size === 0;
    const hasLedger = await verifyMigrationLedger(transaction, checksum);

    // Snapshot legacy data-integrity violations before schema changes.
    // A fresh database has no pre-existing violations to grandfather.
    const baselineViolations = isFresh
      ? []
      : await getForeignKeyViolations(transaction);

    if (isFresh) {
      if (hasLedger) {
        throw new Error(
          "Migration ledger exists without an application schema.",
        );
      }

      for (const statement of bootstrapSql
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)) {
        await transaction.execute(statement);
      }
    } else {
      const missingBaseTables = legacyTables.filter(
        (table) => !applicationTables.has(table),
      );

      if (missingBaseTables.length > 0) {
        throw new Error(
          `Incompatible partial schema; missing base tables: ${missingBaseTables.join(", ")}.`,
        );
      }

      const legacyExpected = new Map(
        [...canonical.tables].filter(([table]) =>
          legacyTables.includes(table),
        ),
      );

      await verifyTableColumns(transaction, legacyExpected, {
        legacy: true,
      });

      await verifyForeignKeys(
        transaction,
        new Map(
          [...canonical.foreignKeys].filter(([table]) =>
            legacyTables.includes(table),
          ),
        ),
      );

      for (const [table, additions] of Object.entries(safeAdditions)) {
        const existingColumns = await tableColumns(transaction, table);
        const found = new Map(
          existingColumns.map((column) => [
            String(column.name),
            column,
          ]),
        );

        for (const addition of additions) {
          const column = found.get(addition.name);

          if (!column) {
            await transaction.execute(
              `ALTER TABLE \`${table}\` ADD COLUMN ${addition.sql}`,
            );
          } else if (
            Number(column.notnull) !== Number(addition.notNull) ||
            normalizeDefault(column.dflt_value) !== addition.defaultValue
          ) {
            throw new Error(
              `Incompatible column definition: ${table}.${addition.name}.`,
            );
          }
        }
      }

      for (const table of ["commission_settlements", "whatsapp_outbox"]) {
        if (!applicationTables.has(table)) {
          const statement = canonical.tableStatements.get(table);

          if (!statement) {
            throw new Error(
              `Canonical table definition is missing: ${table}.`,
            );
          }

          await transaction.execute(statement);
        }
      }
    }

    for (const table of canonical.tables.keys()) {
      if (!(await existingTables(transaction)).has(table)) {
        throw new Error(
          `Required table is missing after migration: ${table}.`,
        );
      }
    }

    await verifyTableColumns(transaction, canonical.tables);
    await verifyForeignKeys(transaction, canonical.foreignKeys);
    await ensureIndexes(transaction, canonical.indexes);

    if (!(await existingTables(transaction)).has(ledgerTable)) {
      await transaction.execute(
        `CREATE TABLE \`${ledgerTable}\` (version text PRIMARY KEY NOT NULL, checksum text NOT NULL, applied_at integer NOT NULL)`,
      );
    }

    await transaction.execute({
      sql: `INSERT INTO \`${ledgerTable}\` (version, checksum, applied_at) VALUES (?, ?, ?) ON CONFLICT(version) DO NOTHING`,
      args: [migrationVersion, checksum, Date.now()],
    });

    await verifyFinalMigrationLedger(transaction, checksum);

    const currentViolations = await getForeignKeyViolations(transaction);

    if (isFresh) {
      if (currentViolations.length > 0) {
        throw new Error(
          "Fresh database failed its foreign-key check; the migration was rolled back.",
        );
      }
    } else {
      assertNoNewForeignKeyViolations(
        baselineViolations,
        currentViolations,
      );
    }

    await transaction.commit();

    return {
      baseline: isFresh ? ("fresh" as const) : ("legacy" as const),
      version: migrationVersion,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}
