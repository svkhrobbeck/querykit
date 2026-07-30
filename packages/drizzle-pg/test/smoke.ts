/**
 * Real-DB smoke test for @querykitjs/drizzle-pg. Not published (see package.json
 * "files"). Requires a reachable Postgres via DATABASE_URL.
 *
 *   DATABASE_URL=postgres://user:pass@localhost:5432/db bun run test/smoke.ts
 *
 * It creates an isolated `qk_smoke` schema, exercises every feature, then drops it.
 */
import { relations, sql } from "drizzle-orm";
import { integer, pgSchema, serial, text, timestamp } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { createRegistry, createFilters } from "../src/index";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL to run the smoke test.");

/* ------------------------------- schema ----------------------------------- */

const s = pgSchema("qk_smoke");

const users = s.table("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});
const posts = s.table("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
const usersRelations = relations(users, ({ many }) => ({ posts: many(posts) }));
const postsRelations = relations(posts, ({ one }) => ({ author: one(users, { fields: [posts.authorId], references: [users.id] }) }));

const schema = { users, posts, usersRelations, postsRelations };

/* -------------------------------- runner ---------------------------------- */

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}

async function main() {
  const client = postgres(url!);
  const db = drizzle(client, { schema });
  const registry = createRegistry(db, schema);
  const usersRepo = registry.repository(users);
  const postsRepo = registry.repository(posts);
  const uf = createFilters<typeof users>();

  // fresh isolated schema
  await client.unsafe(`DROP SCHEMA IF EXISTS qk_smoke CASCADE`);
  await client.unsafe(`CREATE SCHEMA qk_smoke`);
  await client.unsafe(`CREATE TABLE qk_smoke.users (
    id serial PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await client.unsafe(`CREATE TABLE qk_smoke.posts (
    id serial PRIMARY KEY, title text NOT NULL,
    author_id integer NOT NULL REFERENCES qk_smoke.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz, deleted_at timestamptz)`);

  try {
    // seed
    const [ali, , guli] = await usersRepo.createMany([
      { name: "Ali Valiyev", email: "ali@example.com" },
      { name: "Vali Aliyev", email: "vali@example.com" },
      { name: "Guli Karimova", email: "guli@example.com" },
    ]);
    await postsRepo.createMany([
      { title: "A1", authorId: ali!.id },
      { title: "A2", authorId: ali!.id },
      { title: "G1", authorId: guli!.id },
    ]);

    // 1. advanced nested filter
    const filtered = await usersRepo.findAll({
      filter: uf.or(uf.contains("name", "ali"), uf.endsWith("email", "example.com")),
    });
    check("nested and/or filter", filtered.length === 3);

    // 2. multi-field sort
    const sorted = await usersRepo.findAll({
      sort: [
        { key: "name", direction: "asc" },
        { key: "createdAt", direction: "desc" },
      ],
      columns: { name: true },
    });
    check("multi-field sort", sorted[0]!.name === "Ali Valiyev" && sorted[2]!.name === "Vali Aliyev");

    // 3. offset pagination
    const list = await usersRepo.findList({ page: 1, perPage: 2 });
    check("offset pagination", list.data.length === 2 && list.meta.total_items === 3 && list.meta.has_next);

    // 3b. default perPage: 20 (core) when omitted; configurable via registry options
    const defList = await usersRepo.findList({});
    check("default perPage = 20 (core)", defList.meta.per_page === 20);
    const cfgRepo = createRegistry(db, schema, { defaultPerPage: 25 }).repository(users);
    check("registry option overrides default perPage", (await cfgRepo.findList({})).meta.per_page === 25);

    // 4. infinite
    const inf = await usersRepo.findInfinite({ limit: 2, offset: 0 });
    check("infinite scroll", inf.data.length === 2 && inf.meta.has_more && inf.meta.next_offset === 2);

    // 5. cursor forward + backward
    const c1 = await usersRepo.findCursor({ limit: 2, order: "asc" });
    const c2 = await usersRepo.findCursor({ limit: 2, order: "asc", cursor: c1.meta.next_cursor });
    const back = await usersRepo.findCursor({ limit: 2, order: "asc", cursor: c2.meta.prev_cursor, direction: "backward" });
    check("cursor forward", c1.data.length === 2 && !c1.meta.has_prev && c1.meta.has_next);
    check("cursor backward returns first page", back.data.map(u => u.id).join() === c1.data.map(u => u.id).join());
    // cursor column force-included even when columns omit it
    const cCols = await usersRepo.findCursor({ limit: 2, order: "asc", columns: { name: true } });
    const cCols2 = await usersRepo.findCursor({ limit: 2, order: "asc", cursor: cCols.meta.next_cursor, columns: { name: true } });
    check(
      "cursor works with columns omitting id",
      cCols.meta.next_cursor !== null && cCols2.data.length > 0 && cCols2.data.map(u => u.name).join() !== cCols.data.map(u => u.name).join(),
    );

    // 6. with + columns inference (runtime)
    const withRel = await postsRepo.findAll({ with: { author: true }, columns: { id: true, title: true } });
    check("with relation loaded", Boolean((withRel[0] as { author?: unknown }).author));

    // 7. transaction rollback
    const before = await postsRepo.count();
    try {
      await registry.transaction(async () => {
        await postsRepo.create({ title: "rollback", authorId: ali!.id });
        throw new Error("boom");
      });
    } catch {
      /* expected */
    }
    check("transaction rollback", (await postsRepo.count()) === before);

    // 8. transaction commit
    await registry.transaction(async () => {
      await postsRepo.create({ title: "c1", authorId: ali!.id });
      await postsRepo.create({ title: "c2", authorId: ali!.id });
    });
    check("transaction commit", (await postsRepo.count()) === before + 2);

    // 9. soft-delete + restore + updatedAt bump
    const p = await postsRepo.create({ title: "temp", authorId: ali!.id });
    const active = await postsRepo.count();
    const del = await postsRepo.softDelete(p.id);
    check("soft-delete excludes + bumps updatedAt", Boolean(del?.deletedAt) && Boolean(del?.updatedAt) && (await postsRepo.count()) === active - 1);
    check("withDeleted includes", (await postsRepo.findAll({ withDeleted: true })).length === active);
    await postsRepo.restore(p.id);
    check("restore", (await postsRepo.count()) === active);

    // 10. scoped (scope wins on create + base filter on read)
    const scoped = postsRepo.scoped({ authorId: guli!.id });
    const created = await scoped.create({ title: "scoped", authorId: 999999 });
    const scopedAll = await scoped.findAll({ columns: { authorId: true } });
    check("scoped create wins + filters reads", created.authorId === guli!.id && scopedAll.every(x => x.authorId === guli!.id));

    // 11. upsert + upsertMany
    const u1 = await usersRepo.upsert({ email: "ali@example.com", name: "Ali (upd)" }, { target: "email" });
    check("upsert updates existing", u1.id === ali!.id && u1.name === "Ali (upd)");
    const many = await usersRepo.upsertMany(
      [
        { name: "New1", email: "new1@example.com" },
        { name: "New2", email: "new2@example.com" },
      ],
      { target: "email" },
    );
    check("upsertMany inserts", many.length === 2 && (await usersRepo.count()) === 5);

    // 12. aggregate
    const agg = await postsRepo.aggregate({ count: true, groupBy: "authorId" });
    const aliCount = agg.find(r => r.authorId === ali!.id)?.count;
    check("aggregate count by group", typeof aliCount === "number" && aliCount > 0, `ali posts=${aliCount}`);

    // 13. wire (ISO string) date filters on a timestamp column — P0-1.
    // `createdAt` is timestamp(mode:"date"), so before the fix drizzle called
    // `value.toISOString()` on the string and the whole request 500'd.
    // The SQL-level variants (mode:"string", text operators, param values) live
    // in test/sql.ts, which needs no database.
    const total = await usersRepo.count();
    const pastIso = new Date(Date.now() - 3_600_000).toISOString();
    const futureIso = new Date(Date.now() + 3_600_000).toISOString();

    check("timestamp filter: >= ISO string", (await usersRepo.findAll({ filter: [uf.gte("createdAt", pastIso)] })).length === total);
    check("timestamp filter: <= ISO string", (await usersRepo.findAll({ filter: [uf.lte("createdAt", futureIso)] })).length === total);
    check("timestamp filter: between ISO tuple", (await usersRepo.findAll({ filter: [uf.between("createdAt", pastIso, futureIso)] })).length === total);
    check("timestamp filter: >= future ISO excludes all", (await usersRepo.findAll({ filter: [uf.gte("createdAt", futureIso)] })).length === 0);
    check("timestamp filter: notBetween ISO tuple", (await usersRepo.findAll({ filter: [uf.notBetween("createdAt", pastIso, futureIso)] })).length === 0);
    check("timestamp filter: in ISO array does not crash", Array.isArray(await usersRepo.findAll({ filter: [uf.in("createdAt", [pastIso, futureIso])] })));
    check("timestamp filter: Date object still works", (await usersRepo.findAll({ filter: [uf.lte("createdAt", new Date(futureIso))] })).length === total);
    check(
      "timestamp filter: uncastable value is skipped, not crashed",
      (await usersRepo.findAll({ filter: [uf.gte("createdAt", "not-a-date")] })).length === total,
    );
    // Postgres renders the timestamp as text, so ILIKE works here. Mongo cannot
    // regex a Date path and skips the condition instead — a documented divergence
    // (see the mongoose adapter's buildCondition).
    check("timestamp filter: text pattern keeps the raw string", (await usersRepo.findAll({ filter: [uf.contains("createdAt", "20")] })).length === total);

    // 14. cursor pagination over a timestamp column — the second P0-1 site.
    // A token stores the date as an ISO string, so page 2 crashed before the fix.
    // Rows may share a `now()` timestamp, so only reachability is asserted.
    const tc1 = await usersRepo.findCursor({ limit: 2, cursorKey: "createdAt", order: "asc" });
    check("cursor on timestamp key: page 1 + token", tc1.data.length === 2 && typeof tc1.meta.next_cursor === "string");
    const tc2 = await usersRepo.findCursor({ limit: 2, cursorKey: "createdAt", order: "asc", cursor: tc1.meta.next_cursor });
    check("cursor on timestamp key: page 2 does not crash", Array.isArray(tc2.data));
    const tcBack = await usersRepo.findCursor({ limit: 2, cursorKey: "createdAt", order: "asc", cursor: tc1.meta.next_cursor, direction: "backward" });
    check("cursor on timestamp key: backward does not crash", Array.isArray(tcBack.data));

    // 15. projection guards — the P1-4 layer that removes the route-level
    // `{ ...params, columns: SAFE_COLUMNS }` spread trick. `email` stands in for
    // `password`. The SQL-level variants live in test/sql.ts (no DB needed).
    const keysOf = (row: unknown) => Object.keys(row as object).sort();

    const forcedRepo = registry.repository(users, { forcedColumns: { id: true, name: true } });
    const forcedRow = (await forcedRepo.findAll({ columns: { email: true } }))[0];
    check("forcedColumns: client selection ignored", !keysOf(forcedRow).includes("email"), keysOf(forcedRow).join());
    check("forcedColumns: keeps the forced columns", keysOf(forcedRow).join() === "id,name", keysOf(forcedRow).join());
    const forcedNoColumns = (await forcedRepo.findList({})).data[0];
    check("forcedColumns: applied when the client sends nothing", keysOf(forcedNoColumns).join() === "id,name", keysOf(forcedNoColumns).join());

    const allowRepo = registry.repository(users, { allowedColumns: ["id", "name"] });
    const intersected = (await allowRepo.findAll({ columns: { name: true, email: true } }))[0];
    check("allowedColumns: intersects the client selection", keysOf(intersected).join() === "name", keysOf(intersected).join());
    const rejectedSel = (await allowRepo.findAll({ columns: { email: true } }))[0];
    check(
      "allowedColumns: a fully rejected selection yields the allowlist, NOT the full row",
      keysOf(rejectedSel).join() === "id,name",
      keysOf(rejectedSel).join(),
    );
    const noSelection = (await allowRepo.findAll({}))[0];
    check("allowedColumns: applied when the client sends nothing", keysOf(noSelection).join() === "id,name", keysOf(noSelection).join());

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

    // 16. a client-chosen cursorKey must not become a way around the guard
    const cursorLeak = await forcedRepo.findCursor({ limit: 1, cursorKey: "email", order: "asc" });
    check("cursorKey cannot leak a forbidden column", !keysOf(cursorLeak.data[0]).includes("email"), keysOf(cursorLeak.data[0]).join());
    check("…while pagination still works (token issued)", typeof cursorLeak.meta.next_cursor === "string", String(cursorLeak.meta.next_cursor));
    const cursorAllowed = await forcedRepo.findCursor({ limit: 1, cursorKey: "id", order: "asc" });
    check("a permitted cursorKey stays in the row", keysOf(cursorAllowed.data[0]).includes("id"), keysOf(cursorAllowed.data[0]).join());

    // 17. aggregate honours the guard too — min(email) leaks as much as a column
    const aggGuarded = await forcedRepo.aggregate({ count: true, min: "email" });
    check("aggregate: a forbidden min is dropped", !("min_email" in (aggGuarded[0] ?? {})), Object.keys(aggGuarded[0] ?? {}).join());
    const aggOpen = await usersRepo.aggregate({ count: true, min: "email" });
    check("aggregate: unguarded repo is unchanged", "min_email" in (aggOpen[0] ?? {}), Object.keys(aggOpen[0] ?? {}).join());

    // 18. pagination caps — defense in depth if validation was bypassed
    check("perPage is capped at 200 by default", (await usersRepo.findList({ perPage: 10_000 })).meta.per_page === 200);
    check("infinite limit is capped at 200", (await usersRepo.findInfinite({ limit: 10_000 })).meta.limit === 200);
    check("cursor limit is capped at 200", (await usersRepo.findCursor({ limit: 10_000 })).meta.limit === 200);
    const cappedRepo = createRegistry(db, schema, { maxPerPage: 50, maxLimit: 25 }).repository(users);
    check("registry maxPerPage is honoured", (await cappedRepo.findList({ perPage: 10_000 })).meta.per_page === 50);
    check("registry maxLimit is honoured", (await cappedRepo.findInfinite({ limit: 10_000 })).meta.limit === 25);
    check("a request under the cap is untouched", (await usersRepo.findList({ perPage: 15 })).meta.per_page === 15);

    // 19. registry arities — same four shapes as the mongoose adapter
    check("arity: repository(table)", typeof registry.repository(users).findAll === "function");
    const extendedRepo = registry.repository(users, base => ({ byName: (name: string) => base.findAll({ filter: [uf.eq("name", name)] }) }));
    check("arity: repository(table, extend)", typeof extendedRepo.byName === "function" && typeof extendedRepo.findAll === "function");
    check("arity: repository(table, options)", typeof registry.repository(users, { allowedColumns: ["id"] }).findAll === "function");
    const bothRepo = registry.repository(users, { allowedColumns: ["id", "name"] }, base => ({ first: () => base.findOne({}) }));
    check("arity: repository(table, options, extend)", typeof bothRepo.first === "function" && typeof bothRepo.findAll === "function");
    const bothRow = (await bothRepo.findAll({ columns: { email: true } }))[0];
    check("arity: options still apply when an extender is passed", keysOf(bothRow).join() === "id,name", keysOf(bothRow).join());

    const scopedGuarded = (await forcedRepo.scoped({ name: "Ali (upd)" }).findAll({ columns: { email: true } }))[0];
    check("scoped() preserves forcedColumns", scopedGuarded === undefined || !keysOf(scopedGuarded).includes("email"));

    // 20. wire-shaped params need no `as` cast — the compile-time promise of P1-2
    const wireParams = {
      filter: [{ key: "name", operation: "%_%" as const, value: "ali" }],
      sort: [{ key: "createdAt", direction: "desc" as const }],
      page: 1,
      perPage: 20,
    };
    check("wire-shaped params compile without a cast", Array.isArray((await usersRepo.findList(wireParams)).data));
    check(
      "an unknown wire key is skipped, not a type error",
      (await usersRepo.findAll({ filter: [{ key: "nope", operation: "=", value: 1 }] })).length === (await usersRepo.count()),
    );

    console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
  } finally {
    await client.unsafe(`DROP SCHEMA IF EXISTS qk_smoke CASCADE`);
    await client.end();
  }

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
