import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

/** Whether a value looks like a Drizzle column object. */
function isColumn(value: unknown): value is AnyPgColumn {
  return typeof value === "object" && value !== null && "name" in value && "columnType" in value;
}

/**
 * Find a table's export name in the schema (used as the `db.query` key).
 * Returns `undefined` when the table is not part of the schema.
 */
export function getTableKey(schema: Record<string, unknown>, table: AnyPgTable): string | undefined {
  for (const [key, value] of Object.entries(schema)) {
    if (value === table) return key;
  }
  return undefined;
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

/** All real columns of a table, keyed by JS property name. */
export function tableColumns(table: AnyPgTable): Array<[string, AnyPgColumn]> {
  const out: Array<[string, AnyPgColumn]> = [];
  for (const [key, value] of Object.entries(table as unknown as Record<string, unknown>)) {
    if (isColumn(value)) out.push([key, value]);
  }
  return out;
}
