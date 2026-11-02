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
import { cloneRows } from "../../core/test/conformance/fixtures";
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
    then: (resolve: (rows: Array<{ value: number }>) => void) => resolve([{ value: filterRows(cloneRows(), where, columnKey).length }]),
  };
}

const fakeDb = {
  query: {
    users: {
      findMany: async (config?: FindConfig) => findMany(config),
      findFirst: async (config?: FindConfig) => findMany({ ...config, limit: 1 })[0],
    },
  },
  select: () => ({ from: () => countQuery() }),
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
    } as never);
    const result = (await (repository[call.method] as (params: unknown) => Promise<unknown>)(call.params)) as
      Record<string, unknown>[] | { data: Record<string, unknown>[]; meta: Record<string, unknown> };
    return Array.isArray(result) ? { rows: result } : { rows: result.data, meta: result.meta };
  },
};

if ((import.meta as { main?: boolean }).main) await runConformanceCli(drizzleHarness);
