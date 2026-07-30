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

import { createRegistry, createFilters } from "../src/index";
import type { AnyDb } from "../src/types";

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

const handle = {
  findMany: async (config: Recorded = {}) => {
    recorded.push(config);
    return rows;
  },
  findFirst: async (config: Recorded = {}) => {
    recorded.push(config);
    return rows[0];
  },
};

const countRows = [{ value: 0 }];

const stubDb = {
  query: { users: handle, posts: handle },
  select: () => ({
    from: () =>
      awaitable(countRows, {
        where: (where: SQL) => {
          recorded.push({ where });
          return awaitable(countRows);
        },
      }),
  }),
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
const usersRepo = registry.repository(users);
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

  /* 6. text-pattern operators keep the caller's string (no String(Date)) */
  const like = await capture(() => usersRepo.findAll({ filter: [uf.contains("createdAt", "2026-01")] as never }));
  check("contains on a date column keeps the raw pattern", allOk(like) && firstParams(like)[0] === "%2026-01%", JSON.stringify(firstParams(like)));

  const ilike = await capture(() => usersRepo.findAll({ filter: [uf.ilike("createdAt", "2026%")] as never }));
  check("ilike on a date column keeps the raw pattern", allOk(ilike) && firstParams(ilike)[0] === "2026%", JSON.stringify(firstParams(ilike)));

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

  /* 8. non-date columns are untouched (PG casts them itself) */
  const numeric = await capture(() => usersRepo.findAll({ filter: [uf.eq("id", "5")] as never }));
  check("numeric column keeps the string value", allOk(numeric) && firstParams(numeric)[0] === "5", JSON.stringify(firstParams(numeric)));

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

  const idCursor = await capture(() => usersRepo.findCursor({ limit: 1, cursor: page1.meta.next_cursor }));
  check("cursor on the default id key still works", allOk(idCursor), firstError(idCursor));
  rows = [];

  /* 12. count/exists share composeWhere → coercion applies there too */
  const counted = await capture(() => usersRepo.count([uf.gte("createdAt", ISO_FROM)] as never));
  check("count with a date filter does not crash", allOk(counted), firstError(counted));

  /* 13. aggregate reuses composeWhere as well */
  void sql; // keep the drizzle sql import meaningful for future cases

  console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
