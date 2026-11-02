/**
 * Conformance runner for @querykitjs/drizzle-pg — **no database required**.
 *
 *   bun run packages/drizzle-pg/test/conformance.ts
 *
 * The real repository runs against a stub executor; the stub hands every
 * `where` / `orderBy` drizzle builds to `fake-pg.ts`, which evaluates the
 * rendered SQL on the shared fixture rows. The shared table then judges rows,
 * meta, skip reports and errors (`packages/core/test/conformance`).
 */
import { getTableColumns, type SQL } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

import type { Call, CaseOptions } from "../../core/test/conformance/cases";
import { cloneRows, recordCall, writeRows, type ConformanceRow } from "../../core/test/conformance/fixtures";
import { callArgs, toResult } from "../../core/test/conformance/harness-util";
import { runConformanceCli, type Harness } from "../../core/test/conformance/runner";
import { pick } from "../../core/test/conformance/semantics";
import { createRegistry } from "../src/index";
import type { AnyDb } from "../src/types";

import { filterRows, orderRows } from "./fake-pg";

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  age: integer("age"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
const schema = { users };

const keyByColumn = new Map(Object.entries(getTableColumns(users)).map(([key, column]) => [column.name, key]));
const columnKey = (name: string): string => {
  const key = keyByColumn.get(name);
  if (!key) throw new Error(`fake-pg: unknown column "${name}"`);
  return key;
};

interface FindConfig {
  where?: SQL;
  orderBy?: SQL[];
  limit?: number;
  offset?: number;
  columns?: Record<string, boolean>;
}

function findMany(config: FindConfig = {}): Record<string, unknown>[] {
  recordCall("find", config.limit);
  const ordered = orderRows(filterRows(cloneRows(), config.where, columnKey), config.orderBy, columnKey);
  const offset = config.offset ?? 0;
  const page = ordered.slice(offset, config.limit === undefined ? undefined : offset + config.limit);
  const selected = Object.keys(config.columns ?? {}).filter(key => config.columns![key]);
  return selected.length > 0 ? page.map(row => pick(row, selected)) : page;
}

/** `select().from(table)[.where(w)]` — the count query, awaitable at any step. */
function countQuery(where?: SQL) {
  return {
    where: (next: SQL) => countQuery(next),
    then: (resolve: (rows: Array<{ value: number }>) => void) => {
      recordCall("count");
      resolve([{ value: filterRows(cloneRows(), where, columnKey).length }]);
    },
  };
}

/** `update(t).set(v).where(w).returning(sel?)` / `delete(t).where(w).returning(sel?)` on the case's rows (task 013). */
function writeQuery(kind: "update" | "delete") {
  let values: Record<string, unknown> = {};
  let where: SQL | undefined;
  const run = (selection?: Record<string, unknown>) => {
    recordCall("write");
    const rows = cloneRows();
    const hit = new Set(filterRows(rows, where, columnKey).map(row => row.id));
    const changed = kind === "update" ? rows.map(row => (hit.has(row.id) ? ({ ...row, ...values } as ConformanceRow) : row)) : rows;
    writeRows(kind === "update" ? changed : rows.filter(row => !hit.has(row.id)));
    const affected = changed.filter(row => hit.has(row.id));
    return selection ? affected.map(() => Object.fromEntries(Object.keys(selection).map(key => [key, 1]))) : affected;
  };
  const query = {
    set: (next: Record<string, unknown>) => ((values = next), query),
    where: (next: SQL | undefined) => ((where = next), query),
    returning: async (selection?: Record<string, unknown>) => run(selection),
    then: (resolve: (value: unknown) => void) => resolve(run()),
  };
  return query;
}

const fakeDb = {
  query: {
    users: {
      findMany: async (config?: FindConfig) => findMany(config),
      findFirst: async (config?: FindConfig) => findMany({ ...config, limit: 1 })[0],
    },
  },
  select: () => ({ from: () => countQuery() }),
  update: () => writeQuery("update"),
  delete: () => writeQuery("delete"),
} as unknown as AnyDb;

/** The 3.x behaviour for the cases that predate the policy: every column, every operator, every sort field. */
const COLUMNS = Object.keys(getTableColumns(users));
const OPEN_POLICY = { filterable: Object.fromEntries(COLUMNS.map(key => [key, "*"])), sortable: COLUMNS };

const policyOptions = (policy: CaseOptions["policy"]) => (policy === undefined ? OPEN_POLICY : policy === "default" ? {} : policy);

export const drizzleHarness: Harness = {
  name: "drizzle-pg",
  async run(call: Call, options: CaseOptions, onSkipped) {
    const registry = createRegistry(fakeDb, schema, { strict: options.strict, onSkippedCondition: onSkipped, cursorSecret: options.cursorSecret });
    const repository = registry.repository(users, {
      ...policyOptions(options.policy),
      forcedColumns: options.forcedColumns,
      allowedColumns: options.allowedColumns,
      scope: options.scope,
    } as never);
    return toResult(await (repository[call.method] as (...args: unknown[]) => Promise<unknown>)(...callArgs(call)));
  },
};

if ((import.meta as { main?: boolean }).main) await runConformanceCli(drizzleHarness);
