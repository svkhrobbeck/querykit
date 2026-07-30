import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

/** Whether a value looks like a Drizzle column object. */
function isColumn(value: unknown): value is AnyPgColumn {
  return typeof value === "object" && value !== null && "name" in value && "columnType" in value;
}

/**
 * Find a table's export name in the schema (used as the `db.query` key).
 * Matched by **object identity**, the way drizzle keys `db.query`. Returns
 * `undefined` when the table is not part of the schema.
 */
export function getTableKey(schema: Record<string, unknown>, table: AnyPgTable): string | undefined {
  for (const [key, value] of Object.entries(schema)) {
    if (value === table) return key;
  }
  return undefined;
}

/** Whether a schema entry is a table (as opposed to a `relations()` declaration). */
export function isTable(value: unknown): value is AnyPgTable {
  return typeof value === "object" && value !== null && Symbol.for("drizzle:IsDrizzleTable") in value;
}

/**
 * Resolve a column from a table by either its JS property name (e.g. `createdAt`)
 * or its DB column name (e.g. `created_at`).
 */
export function resolveColumn(table: AnyPgTable, key: string): AnyPgColumn | undefined {
  const columns = table as unknown as Record<string, unknown>;
  const direct = columns[key];
  if (isColumn(direct)) return direct;

  for (const value of Object.values(columns)) {
    if (isColumn(value) && value.name === key) return value;
  }
  return undefined;
}

/**
 * Cast a wire (JSON) value to the column's type — an ISO string / epoch number
 * becomes a `Date`. Drizzle maps `timestamp`/`date` columns in `mode: "date"` to
 * a JS `Date` and calls `.toISOString()` when handing the value to the driver, so
 * a plain string crashes there. `mode: "string"` columns report
 * `dataType: "string"` and are therefore left untouched automatically.
 *
 * An unparseable string is returned unchanged (drizzle reports it) — see
 * `coerceCondition` for the operator-aware wrapper. Mirrors the mongoose
 * adapter's `castValue` contract.
 */
export function castValue(column: AnyPgColumn, value: unknown): unknown {
  if (column.dataType !== "date") return value;
  if (value === null || value === undefined || value instanceof Date) return value;
  if (typeof value !== "string" && typeof value !== "number") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}

/** All real columns of a table, keyed by JS property name. */
export function tableColumns(table: AnyPgTable): Array<[string, AnyPgColumn]> {
  const out: Array<[string, AnyPgColumn]> = [];
  for (const [key, value] of Object.entries(table as unknown as Record<string, unknown>)) {
    if (isColumn(value)) out.push([key, value]);
  }
  return out;
}
