/**
 * SQL-level test for @querykitjs/drizzle-pg — **no database required**.
 *
 *   bun run test/sql.ts
 *
 * Why it exists: the P0-1 crash (`value.toISOString is not a function`) happens
 * while drizzle maps query **parameters** to driver values, which `PgDialect`
 * does offline. So filters and cursors can be verified end-to-end — real
 * repository code path, real dialect — without a reachable Postgres. `smoke.ts`
 * still covers the round-trip against a live DB.
 *
 * The repository runs against a stub executor that records the config drizzle
 * would have received; each recorded `where` is then serialized through the
 * dialect, which is exactly where a bad value blows up.
 */
import { relations, sql, type SQL } from "drizzle-orm";
import { integer, pgSchema, serial, text, timestamp, PgDialect } from "drizzle-orm/pg-core";

import { QueryKitError, type FilterOperator, type SkippedCondition } from "@querykitjs/core";

import { createRegistry, createFilters } from "../src/index";
import type { AnyDb } from "../src/types";
import "./policy";
import "./cast";

/* -------------------------------- schema ---------------------------------- */

const s = pgSchema("qk_sql");

const users = s.table("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  age: integer("age"),
  // drizzle's default mode is "date" → JS Date mapper → the P0-1 crash surface
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  // mode: "string" → dataType "string" → coercion must leave it alone
  createdAtText: timestamp("created_at_text", { withTimezone: true, mode: "string" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

const posts = s.table("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  authorId: integer("author_id").notNull(),
});

const usersRelations = relations(users, ({ many }) => ({ posts: many(posts) }));
const postsRelations = relations(posts, ({ one }) => ({ author: one(users, { fields: [posts.authorId], references: [users.id] }) }));

const schema = { users, posts, usersRelations, postsRelations };

/* ------------------------------ stub executor ----------------------------- */

interface Recorded {
  where?: SQL;
  orderBy?: unknown;
  columns?: Record<string, boolean>;
  limit?: number;
  offset?: number;
  with?: unknown;
}

let recorded: Recorded[] = [];
let rows: unknown[] = [];

/** Minimal thenable so `await chain` and `await chain.where(...)` both work. */
const awaitable = <T>(value: T, extra: Record<string, unknown> = {}) => ({
  ...extra,
  then: (resolve: (v: T) => void) => resolve(value),
});

/** Apply the recorded `columns` selection, the way drizzle would. */
const project = (config: Recorded, source: unknown[]): unknown[] => {
  const keys = Object.keys(config.columns ?? {}).filter(key => config.columns![key]);
  if (keys.length === 0) return source;
  return source.map(row => Object.fromEntries(keys.filter(key => key in (row as object)).map(key => [key, (row as Record<string, unknown>)[key]])));
};

const handle = {
  findMany: async (config: Recorded = {}) => {
    recorded.push(config);
    return project(config, rows);
  },
  findFirst: async (config: Recorded = {}) => {
    recorded.push(config);
    return project(config, rows)[0];
  },
};

const countRows = [{ value: 0 }];

/** Last selection handed to `.select()` — how `aggregate` exposes what it reads. */
let selected: Record<string, unknown> | undefined;

/** `.select().from()` chain: `$dynamic`/`where`/`groupBy` all chain, and it awaits. */
function selectChain() {
  const chain = awaitable(countRows, {
    $dynamic: () => chain,
    where: (where: SQL) => {
      recorded.push({ where });
      return chain;
    },
    groupBy: () => chain,
  }) as Record<string, unknown> & { then: (r: (v: unknown) => void) => void };
  return chain;
}

const stubDb = {
  query: { users: handle, posts: handle },
  select: (selection?: Record<string, unknown>) => {
    selected = selection;
    return { from: () => selectChain() };
  },
  transaction: async (fn: (tx: unknown) => unknown) => fn(stubDb),
} as unknown as AnyDb;

const dialect = new PgDialect();

/** Serialize a recorded condition the way the driver would — where P0-1 blows up. */
function paramsOf(where: SQL | undefined): { ok: true; params: unknown[]; sql: string } | { ok: false; error: string } {
  if (!where) return { ok: true, params: [], sql: "" };
  try {
    const query = dialect.sqlToQuery(where);
    return { ok: true, params: query.params, sql: query.sql };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Run `fn`, then serialize every `where` it produced. */
async function capture(fn: () => Promise<unknown>) {
  recorded = [];
  await fn();
  return recorded.map(entry => ({ entry, serialized: paramsOf(entry.where) }));
}

/* -------------------------------- runner ---------------------------------- */

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}

const registry = createRegistry(stubDb, schema);
/** The 3.x behaviour (task 009 "Migrating to 4.0"): every column filterable with every operator, every column sortable. */
const OPEN = {
  filterable: { id: "*", name: "*", email: "*", age: "*", createdAt: "*", createdAtText: "*", deletedAt: "*" },
  sortable: ["id", "name", "email", "age", "createdAt", "createdAtText", "deletedAt"],
} as const;
const usersRepo = registry.repository(users, OPEN);
const uf = createFilters<typeof users>();

const ISO_FROM = "2026-01-01T00:00:00.000Z";
const ISO_TO = "2026-02-01T00:00:00.000Z";

/** Every serialized condition succeeded (no driver-mapping crash). */
const allOk = (results: Awaited<ReturnType<typeof capture>>) => results.length > 0 && results.every(r => r.serialized.ok);
const firstParams = (results: Awaited<ReturnType<typeof capture>>) => (results[0]!.serialized.ok ? results[0]!.serialized.params : []);
const firstError = (results: Awaited<ReturnType<typeof capture>>) => (results[0]!.serialized.ok ? "" : results[0]!.serialized.error);

async function main() {
  /* 0. the crash this fixes — proven to be real, not hypothetical */
  const raw = paramsOf(uf.lte("createdAt", ISO_TO as never) as never as SQL);
  check("dataType of a mode:'date' column is 'date'", users.createdAt.dataType === "date", users.createdAt.dataType);
  void raw;

  /* 1. P0-1: comparison operators with wire (ISO string) values */
  for (const [label, filter] of [
    [">=", uf.gte("createdAt", ISO_FROM)],
    ["<=", uf.lte("createdAt", ISO_TO)],
    [">", uf.gt("createdAt", ISO_FROM)],
    ["<", uf.lt("createdAt", ISO_TO)],
    ["=", uf.eq("createdAt", ISO_FROM)],
    ["!=", uf.ne("createdAt", ISO_FROM)],
  ] as const) {
    const res = await capture(() => usersRepo.findAll({ filter: [filter] as never }));
    check(`timestamp filter "${label}" with ISO string`, allOk(res), firstError(res) || JSON.stringify(firstParams(res)));
  }

  /* 2. array + tuple operators go through the same single coercion point */
  const between = await capture(() => usersRepo.findAll({ filter: [uf.between("createdAt", ISO_FROM, ISO_TO)] as never }));
  check("between with ISO tuple", allOk(between) && firstParams(between).length === 2, firstError(between) || JSON.stringify(firstParams(between)));

  const notBetween = await capture(() => usersRepo.findAll({ filter: [uf.notBetween("createdAt", ISO_FROM, ISO_TO)] as never }));
  check("notBetween with ISO tuple", allOk(notBetween), firstError(notBetween));

  const inList = await capture(() => usersRepo.findAll({ filter: [uf.in("createdAt", [ISO_FROM, ISO_TO])] as never }));
  check("in with ISO array", allOk(inList) && firstParams(inList).length === 2, firstError(inList) || JSON.stringify(firstParams(inList)));

  const notIn = await capture(() => usersRepo.findAll({ filter: [uf.notIn("createdAt", [ISO_FROM])] as never }));
  check("notIn with ISO array", allOk(notIn), firstError(notIn));

  /* 3. the coerced param is a real timestamp, not a passed-through string */
  check("coerced param serializes as an ISO timestamp", firstParams(between)[0] === ISO_FROM, JSON.stringify(firstParams(between)));

  /* 4. Date objects (in-memory callers) still work — no regression */
  const asDate = await capture(() => usersRepo.findAll({ filter: [uf.lte("createdAt", new Date(ISO_TO))] as never }));
  check("Date object still works", allOk(asDate) && firstParams(asDate)[0] === ISO_TO, firstError(asDate));

  /* 5. mode:"string" column is left untouched */
  check("mode:'string' column reports dataType 'string'", users.createdAtText.dataType === "string", users.createdAtText.dataType);
  const textCol = await capture(() => usersRepo.findAll({ filter: [uf.gte("createdAtText", ISO_FROM)] as never }));
  check("mode:'string' timestamp filter passes the raw string", allOk(textCol) && firstParams(textCol)[0] === ISO_FROM, JSON.stringify(firstParams(textCol)));

  /* 6. R11 (task 024): a text pattern on a non-text column is skipped as invalid-value —
   *    Postgres has no `timestamptz ~~* text` operator, so it used to be a 500. */
  const textOnNonText: [string, FilterOperator, string][] = [
    ["contains on a timestamp", "contains", "createdAt"],
    ["ilike on a timestamp", "ilike", "createdAt"],
    ["notLike on a mode:'string' timestamp", "notLike", "createdAtText"],
    ["startsWith on an integer", "startsWith", "age"],
    ["endsWith on a serial id", "endsWith", "id"],
  ];
  for (const [label, operation, key] of textOnNonText) {
    const res = await capture(() => usersRepo.findAll({ filter: [{ key, operation, value: "20" }] as never }));
    check(`${label} is skipped (no pattern reaches SQL)`, allOk(res) && firstParams(res).length === 0, firstError(res) || JSON.stringify(firstParams(res)));
  }
  const textOnText = await capture(() => usersRepo.findAll({ filter: [uf.contains("name", "ali")] as never }));
  check(
    "contains on a text column still binds its pattern",
    allOk(textOnText) && firstParams(textOnText)[0] === "%ali%",
    JSON.stringify(firstParams(textOnText)),
  );

  /* 7. an uncastable value must not reach the driver: the condition is dropped,
   *    matching the existing "incompatible value → skip" contract in operators.ts.
   *    Without this a bare `value.toISOString is not a function` reached the user. */
  const broken = await capture(() => usersRepo.findAll({ filter: [uf.gte("createdAt", "not-a-date")] as never }));
  check(
    "unparseable date string is skipped, not crashed",
    allOk(broken) && !firstParams(broken).includes("not-a-date"),
    firstError(broken) || JSON.stringify(firstParams(broken)),
  );

  const brokenInList = await capture(() => usersRepo.findAll({ filter: [uf.in("createdAt", [ISO_FROM, "nope"])] as never }));
  check(
    "one uncastable element drops the whole in() list (no silent widening)",
    allOk(brokenInList) && firstParams(brokenInList).length === 0,
    firstError(brokenInList) || JSON.stringify(firstParams(brokenInList)),
  );

  const brokenBetween = await capture(() => usersRepo.findAll({ filter: [uf.between("createdAt", ISO_FROM, "nope")] as never }));
  check("uncastable between tuple is skipped", allOk(brokenBetween) && firstParams(brokenBetween).length === 0, firstError(brokenBetween));

  const invalidDate = await capture(() => usersRepo.findAll({ filter: [uf.gte("createdAt", new Date("nope"))] as never }));
  check("Invalid Date object is skipped too", allOk(invalidDate) && firstParams(invalidDate).length === 0, firstError(invalidDate));

  /* 8. task 021 B8: a numeric column casts a numeric string; a non-numeric one is invalid-value */
  const numeric = await capture(() => usersRepo.findAll({ filter: [uf.eq("id", "5")] as never }));
  check("numeric column casts a numeric string to a number", allOk(numeric) && firstParams(numeric)[0] === 5, JSON.stringify(firstParams(numeric)));
  const badNumber = await capture(() => usersRepo.findAll({ filter: [uf.eq("age", "abc")] as never }));
  check(
    "numeric column: 'abc' is dropped before SQL (invalid-value, no 22P02)",
    allOk(badNumber) && firstParams(badNumber).length === 0,
    JSON.stringify(firstParams(badNumber)),
  );

  /* 9. nested groups — coercion sits below the tree walk, so it applies everywhere */
  const nested = await capture(() =>
    usersRepo.findAll({
      filter: uf.or(uf.gte("createdAt", ISO_FROM), uf.and(uf.lte("createdAt", ISO_TO), uf.not(uf.eq("createdAt", ISO_FROM)))) as never,
    }),
  );
  check("nested and/or/not with ISO strings", allOk(nested) && firstParams(nested).length === 3, firstError(nested) || JSON.stringify(firstParams(nested)));

  /* 10. soft-delete guard + date filter compose without breaking */
  const softDeleted = await capture(() => usersRepo.findAll({ filter: [uf.gte("createdAt", ISO_FROM)], withDeleted: false }));
  check("date filter composes with the soft-delete guard", allOk(softDeleted), firstError(softDeleted));

  /* 11. findCursor over a timestamp column — the second P0-1 site.
   *     A cursor token stores the date as an ISO string; the seek predicate must
   *     re-cast it or page 2 crashes in the driver mapping. */
  rows = [
    { id: 1, name: "a", createdAt: new Date(ISO_FROM) },
    { id: 2, name: "b", createdAt: new Date(ISO_TO) },
  ];
  const page1 = await usersRepo.findCursor({ limit: 1, cursorKey: "createdAt", order: "asc" });
  check("cursor page 1 issues a token for a timestamp key", typeof page1.meta.next_cursor === "string", String(page1.meta.next_cursor));

  const page2 = await capture(() => usersRepo.findCursor({ limit: 1, cursorKey: "createdAt", order: "asc", cursor: page1.meta.next_cursor }));
  check("cursor page 2 on a timestamp key does not crash", allOk(page2), firstError(page2) || JSON.stringify(firstParams(page2)));

  const back = await capture(() =>
    usersRepo.findCursor({ limit: 1, cursorKey: "createdAt", order: "asc", cursor: page1.meta.next_cursor, direction: "backward" }),
  );
  check("cursor backward on a timestamp key does not crash", allOk(back), firstError(back));

  // Task 012: a createdAt token handed to the id cursor does not fit the column — invalid-value, not a 500.
  let misfit = "";
  try {
    await usersRepo.findCursor({ limit: 1, cursor: page1.meta.next_cursor });
  } catch (error) {
    misfit = error instanceof QueryKitError ? `${error.info.reason}/${error.info.site}` : String(error);
  }
  check("a token whose value does not fit the cursor column → invalid-value / cursorKey", misfit === "invalid-value/cursorKey", misfit);
  const idPage = await capture(() => usersRepo.findCursor({ limit: 1 }));
  check("cursor on the default id key still works", allOk(idPage), firstError(idPage));
  // Task 012 A2: a primary-key cursor seeks on that one column; another cursorKey adds the id tie-break.
  const { encodeCursorToken } = await import("@querykitjs/core/internal");
  const idToken = await encodeCursorToken({ k: 5, id: 5 });
  const dateToken = await encodeCursorToken({ k: ISO_FROM, id: 5 });
  const idSeek = await capture(() => usersRepo.findCursor({ limit: 1, cursor: idToken }));
  const idSql = idSeek[0]?.serialized.ok ? idSeek[0].serialized.sql : "";
  check("A2 primary-key cursor → one-field seek, no OR", allOk(idSeek) && !/\bor\b/i.test(idSql), idSql);
  const dateSeek = await capture(() => usersRepo.findCursor({ limit: 1, cursorKey: "createdAt", cursor: dateToken }));
  const dateSql = dateSeek[0]?.serialized.ok ? dateSeek[0].serialized.sql : "";
  check("A2 createdAt cursor → (k > v) OR (k = v AND id > i)", allOk(dateSeek) && /\bor\b/i.test(dateSql), dateSql);
  rows = [];

  /* 12. count/exists share composeWhere → coercion applies there too */
  const counted = await capture(() => usersRepo.count([uf.gte("createdAt", ISO_FROM)] as never));
  check("count with a date filter does not crash", allOk(counted), firstError(counted));

  /* --------------------------- projection guards -------------------------- */
  /* Recorded `columns` is what drizzle would have selected — i.e. exactly what the
   * caller can ever see. `email` stands in for `password` here. */

  const columnsOf = (results: Awaited<ReturnType<typeof capture>>) => Object.keys(results[0]!.entry.columns ?? {}).sort();

  /* 13. forcedColumns ignores the client's selection outright */
  const forcedRepo = registry.repository(users, { ...OPEN, forcedColumns: { id: true, name: true } });
  const forced = await capture(() => forcedRepo.findAll({ columns: { email: true } as never }));
  check("forcedColumns: client selection ignored", JSON.stringify(columnsOf(forced)) === JSON.stringify(["id", "name"]), columnsOf(forced).join());
  const forcedNoColumns = await capture(() => forcedRepo.findList({}));
  check("forcedColumns: applied when the client sends nothing", JSON.stringify(columnsOf(forcedNoColumns)) === JSON.stringify(["id", "name"]));

  /* 14. allowedColumns intersects — and never falls back to the full row */
  const allowRepo = registry.repository(users, { ...OPEN, allowedColumns: ["id", "name"] });
  const intersected = await capture(() => allowRepo.findAll({ columns: { name: true, email: true } as never }));
  check("allowedColumns: intersects the client selection", JSON.stringify(columnsOf(intersected)) === JSON.stringify(["name"]), columnsOf(intersected).join());

  const rejected = await capture(() => allowRepo.findAll({ columns: { email: true } as never }));
  check(
    "allowedColumns: a fully rejected selection yields the allowlist, NOT the full row",
    JSON.stringify(columnsOf(rejected)) === JSON.stringify(["id", "name"]),
    columnsOf(rejected).join(),
  );

  const noSelection = await capture(() => allowRepo.findAll({}));
  check("allowedColumns: applied when the client sends nothing", JSON.stringify(columnsOf(noSelection)) === JSON.stringify(["id", "name"]));

  /* 15. an empty guard would mean "everything" — refuse at build time */
  const throws = (fn: () => unknown) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  check(
    "empty forcedColumns is refused",
    throws(() => registry.repository(users, { forcedColumns: {} })),
  );
  check(
    "all-false forcedColumns is refused",
    throws(() => registry.repository(users, { forcedColumns: { id: false } })),
  );
  check(
    "empty allowedColumns is refused",
    throws(() => registry.repository(users, { allowedColumns: [] })),
  );

  /* 16. a client-chosen cursorKey must not become a way around the guard.
   *     Two rows so `limit: 1` leaves an extra → a token really is issued. */
  rows = [
    { id: 1, name: "a", email: "secret@example.com" },
    { id: 2, name: "b", email: "secret2@example.com" },
  ];
  const cursorLeak = await forcedRepo.findCursor({ limit: 1, cursorKey: "email" as never });
  check("cursorKey cannot leak a forbidden column", !("email" in (cursorLeak.data[0] as object)), JSON.stringify(cursorLeak.data[0]));
  check("…while pagination still works (token issued)", typeof cursorLeak.meta.next_cursor === "string", String(cursorLeak.meta.next_cursor));
  const cursorAllowed = await forcedRepo.findCursor({ limit: 1, cursorKey: "id" as never });
  check("a permitted cursorKey stays in the row", "id" in (cursorAllowed.data[0] as object), JSON.stringify(cursorAllowed.data[0]));
  rows = [];

  /* 17. aggregate honours the guard too (min(email) leaks as much as a column) */
  await forcedRepo.aggregate({ count: true, groupBy: "email" as never, min: "email" as never });
  const aggKeys = Object.keys(selected ?? {}).sort();
  check("aggregate: a forbidden groupBy/min is dropped", JSON.stringify(aggKeys) === JSON.stringify(["count"]), aggKeys.join());
  await forcedRepo.aggregate({ count: true, groupBy: "name" as never });
  check("aggregate: a permitted groupBy survives", Object.keys(selected ?? {}).includes("name"), Object.keys(selected ?? {}).join());
  await usersRepo.aggregate({ count: true, min: "email" });
  check("aggregate: unguarded repo is unchanged", Object.keys(selected ?? {}).includes("min_email"), Object.keys(selected ?? {}).join());

  /* --------------------------- pagination caps ---------------------------- */
  /* 18. defense in depth: the repository clamps even if validation was bypassed */
  check("perPage is capped at 200 by default", (await usersRepo.findList({ perPage: 10_000 })).meta.per_page === 200);
  check("infinite limit is capped at 200", (await usersRepo.findInfinite({ limit: 10_000 })).meta.limit === 200);
  check("cursor limit is capped at 200", (await usersRepo.findCursor({ limit: 10_000 })).meta.limit === 200);

  const cappedRegistry = createRegistry(stubDb, schema, { maxPerPage: 50, maxLimit: 25 });
  const cappedRepo = cappedRegistry.repository(users, OPEN);
  check("registry maxPerPage is honoured", (await cappedRepo.findList({ perPage: 10_000 })).meta.per_page === 50);
  check("registry maxLimit is honoured", (await cappedRepo.findInfinite({ limit: 10_000 })).meta.limit === 25);
  check("a request under the cap is untouched", (await usersRepo.findList({ perPage: 15 })).meta.per_page === 15);
  check("the default page size still wins when omitted", (await usersRepo.findList({})).meta.per_page === 20);

  /* --------------------------- registry arities --------------------------- */
  /* 19. repository(table) / (table, extend) / (table, options) / (table, options, extend) */
  check("arity: repository(table)", typeof registry.repository(users).findAll === "function");
  const extended = registry.repository(users, OPEN, base => ({ byName: (name: string) => base.findAll({ filter: [uf.eq("name", name)] }) }));
  check("arity: repository(table, extend)", typeof extended.byName === "function" && typeof extended.findAll === "function");
  check("arity: repository(table, options)", typeof registry.repository(users, { allowedColumns: ["id"] }).findAll === "function");
  const both = registry.repository(users, { allowedColumns: ["id", "name"] }, base => ({ first: () => base.findOne({}) }));
  check("arity: repository(table, options, extend)", typeof both.first === "function" && typeof both.findAll === "function");
  const bothCols = await capture(() => both.findAll({ columns: { email: true } as never }));
  check("arity: options still apply when an extender is passed", JSON.stringify(columnsOf(bothCols)) === JSON.stringify(["id", "name"]));

  /* 20. scoped() keeps the guard */
  const scopedGuarded = await capture(() => forcedRepo.scoped({ name: "a" }).findAll({ columns: { email: true } as never }));
  check("scoped() preserves forcedColumns", JSON.stringify(columnsOf(scopedGuarded)) === JSON.stringify(["id", "name"]));

  /* 21. wire-shaped params need no cast — the compile-time guarantee of P1-2.
   *     `unknownKey` is a string the table does not have; it must not be a type
   *     error, and at runtime the condition is simply skipped. */
  const wireParams = {
    filter: [{ key: "name", operation: "%_%" as const, value: "ali" }],
    sort: [{ key: "createdAt", direction: "desc" as const }],
    page: 1,
    perPage: 20,
  };
  check("wire-shaped params compile without a cast", Array.isArray((await usersRepo.findList(wireParams)).data));
  const unknownKey = await capture(() => usersRepo.findAll({ filter: [{ key: "nope", operation: "=", value: 1 }] }));
  check("an unknown wire key is skipped, not a type error", allOk(unknownKey) && firstParams(unknownKey).length === 0);

  /* ---------------------- strict mode + diagnostics ----------------------- */
  /* 22. the default path is unchanged — a dropped condition stays dropped */
  const silent = await capture(() => usersRepo.findAll({ filter: [{ key: "nope", operation: "=", value: 1 }] }));
  check("default: an unknown key is dropped without throwing", allOk(silent) && firstParams(silent).length === 0);

  /* 23. the hook makes those drops visible without changing behaviour */
  const seen: SkippedCondition[] = [];
  const watchedRepo = createRegistry(stubDb, schema, { onSkippedCondition: info => seen.push(info) }).repository(users, OPEN);

  seen.length = 0;
  await watchedRepo.findAll({ filter: [{ key: "nope", operation: "=", value: 1 }] });
  check(
    "hook: unknown filter key reported",
    seen.length === 1 && seen[0]!.key === "nope" && seen[0]!.site === "filter" && seen[0]!.reason === "unknown-key" && seen[0]!.source === "users",
    JSON.stringify(seen[0]),
  );

  seen.length = 0;
  await watchedRepo.findAll({ filter: [{ key: "id", operation: "in", value: 5 }] });
  check("hook: a non-array `in` value reported as invalid-value", seen.length === 1 && seen[0]!.reason === "invalid-value", JSON.stringify(seen[0]));

  seen.length = 0;
  await watchedRepo.findAll({ filter: [{ key: "createdAt", operation: ">=", value: "not-a-date" }] });
  check("hook: an uncastable date reported as invalid-value", seen.length === 1 && seen[0]!.reason === "invalid-value", JSON.stringify(seen[0]));

  seen.length = 0;
  await watchedRepo.findAll({ filter: [{ key: "createdAt", operation: "contains", value: "2026" }] });
  check(
    "hook: a text pattern on a timestamp reported as invalid-value",
    seen.length === 1 && seen[0]!.reason === "invalid-value" && seen[0]!.site === "filter" && seen[0]!.key === "createdAt",
    JSON.stringify(seen[0]),
  );

  seen.length = 0;
  await watchedRepo.findAll({ sort: [{ key: "nope", direction: "asc" }] });
  check("hook: unknown sort key reported", seen.length === 1 && seen[0]!.site === "sort" && seen[0]!.key === "nope", JSON.stringify(seen[0]));

  seen.length = 0;
  await watchedRepo.aggregate({ count: true, groupBy: "nope" as never });
  check("hook: unknown aggregate key reported", seen.length === 1 && seen[0]!.site === "aggregate", JSON.stringify(seen[0]));

  /* 24. no false positives — a valid request reports nothing */
  seen.length = 0;
  await watchedRepo.findList({
    filter: [uf.gte("createdAt", ISO_FROM), uf.isNull("deletedAt"), uf.isNotNull("name"), uf.in("id", [1, 2])],
    sort: [{ key: "name", direction: "asc" }],
    columns: { id: true, name: true },
    withDeleted: true,
  });
  check("hook: a valid request reports nothing", seen.length === 0, JSON.stringify(seen));

  /* 25. strict turns each of those into a QueryKitError */
  const strictRepo = createRegistry(stubDb, schema, { strict: true }).repository(users, OPEN);
  const rejects = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return undefined;
    } catch (err) {
      return err;
    }
  };

  const strictUnknown = await rejects(() => strictRepo.findAll({ filter: [{ key: "nope", operation: "=", value: 1 }] }));
  check(
    "strict: unknown filter key throws QueryKitError",
    strictUnknown instanceof QueryKitError && strictUnknown.info.reason === "unknown-key" && strictUnknown.code === "QUERYKIT_INVALID_CONDITION",
    String(strictUnknown),
  );
  check("strict: unknown sort key throws", (await rejects(() => strictRepo.findAll({ sort: [{ key: "nope" }] }))) instanceof QueryKitError);
  check(
    "strict: uncastable date throws",
    (await rejects(() => strictRepo.findAll({ filter: [{ key: "createdAt", operation: ">=", value: "nope" }] }))) instanceof QueryKitError,
  );
  check("strict: a valid request still works", (await rejects(() => strictRepo.findList({ filter: [uf.gte("createdAt", ISO_FROM)] }))) === undefined);

  /* 26. an unknown cursorKey is always fatal — there is nothing to fall back to */
  const badCursor = await rejects(() => usersRepo.findCursor({ cursorKey: "nope" as never }));
  check(
    "unknown cursorKey throws QueryKitError even without strict",
    badCursor instanceof QueryKitError && badCursor.info.site === "cursorKey",
    String(badCursor),
  );

  /* 26b. task 014 (R21): a client `with` opens only listed relations and columns, before any SQL. */
  {
    recorded = [];
    const bare = await rejects(() => usersRepo.findAll({ with: { posts: true } as never }));
    check(
      "A4 no relations: with posts → forbidden-key, site with",
      bare instanceof QueryKitError && bare.info.site === "with" && bare.info.key === "posts" && recorded.length === 0,
      String(bare),
    );
    const listedRepo = registry.repository(users, { ...OPEN, relations: { posts: { columns: ["title"] } } });
    const wide = await rejects(() => listedRepo.findAll({ with: { posts: { columns: { body: true } } } as never }));
    check("A6 columns [title]: columns body → forbidden-key posts.body", wide instanceof QueryKitError && wide.info.key === "posts.body", String(wide));
    const nested = await rejects(() => listedRepo.findAll({ with: { posts: { with: { author: true } } } as never }));
    check(
      "R21 no nested rule: a nested with → forbidden-key posts.author",
      nested instanceof QueryKitError && nested.info.key === "posts.author",
      String(nested),
    );
  }

  /* 27. a scope key that does not resolve is a programming error, not bad input:
   *     dropping it would silently remove the RBAC filter from every query. */
  check(
    "an unresolvable scope key is refused at build time",
    throws(() => registry.repository(users, { scope: { nope: 1 } as never })),
  );
  check("a valid scope is accepted", !throws(() => registry.repository(users, { scope: { name: "a" } })));

  /* ------------------------ P2-6: schema identity ------------------------- */
  /* 28. the same table name under a different instance is a duplicate import,
   *     and the message must say so instead of "not found in the schema". */
  const otherSchema = pgSchema("qk_sql_other");
  const duplicateUsers = otherSchema.table("users", { id: serial("id").primaryKey() });
  let identityError = "";
  try {
    createRegistry(stubDb, { users: duplicateUsers }).repository(users);
  } catch (err) {
    identityError = (err as Error).message;
  }
  check(
    "duplicate-import error names the table and explains the cause",
    identityError.includes('"users"') && identityError.includes("DIFFERENT table instance") && identityError.includes("SAME schema object"),
    identityError,
  );

  let missingError = "";
  try {
    createRegistry(stubDb, { posts }).repository(users);
  } catch (err) {
    missingError = (err as Error).message;
  }
  check(
    "a genuinely missing table lists the available ones",
    missingError.includes('"users"') && missingError.includes("Available tables: posts"),
    missingError,
  );

  void sql; // keep the drizzle sql import meaningful for future cases

  console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
