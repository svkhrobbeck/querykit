/**
 * Real-DB smoke test for @querykitjs/prisma-pg. Not published (see package.json
 * "files"). Requires a reachable Postgres via DATABASE_URL.
 *
 *   bun run test:generate                                     # once, offline
 *   DATABASE_URL=postgres://user:pass@localhost:5432/db bun run test/smoke.ts
 *
 * It creates an isolated `qk_prisma_smoke` schema, exercises every feature, then
 * drops it. `test/query.ts` already pins everything that can be checked without a
 * server, so this file is about the parts only Postgres can answer: NULL
 * semantics, case-insensitive matching, ordering, transaction rollback and the
 * actual shape Prisma returns.
 *
 * The mirror of this file is `packages/drizzle-pg/test/smoke.ts` — the checks are
 * deliberately the same, because the two adapters must agree.
 */
import { PrismaClient } from "./prisma/generated/index.js";

import { createRegistry, createFilters } from "../src/index";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL to run the smoke test.");

const SCHEMA = "qk_prisma_smoke";
/** Point Prisma at an isolated schema so the test never touches real tables. */
const scoped = new URL(url);
scoped.searchParams.set("schema", SCHEMA);

/* -------------------------------- runner ---------------------------------- */

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}
const ids = (rows: Array<{ id: number }>) => rows.map(r => r.id).join(",");

const prisma = new PrismaClient({ datasources: { db: { url: scoped.toString() } } });

async function main() {
  const registry = createRegistry(prisma);
  const usersRepo = registry.repository("user");
  const postsRepo = registry.repository("post");
  const uf = createFilters<typeof prisma.user>();

  // Fresh isolated schema (no `prisma migrate` dependency).
  await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await prisma.$executeRawUnsafe(`CREATE SCHEMA ${SCHEMA}`);
  await prisma.$executeRawUnsafe(`CREATE TABLE ${SCHEMA}.users (
    id serial PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, age integer,
    created_at timestamptz NOT NULL DEFAULT now())`);
  await prisma.$executeRawUnsafe(`CREATE TABLE ${SCHEMA}.posts (
    id serial PRIMARY KEY, title text NOT NULL,
    author_id integer NOT NULL REFERENCES ${SCHEMA}.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz, deleted_at timestamptz)`);

  try {
    /* --------------------------------- seed -------------------------------- */
    const [ali, , guli] = await usersRepo.createMany([
      { name: "Ali Valiyev", email: "ali@example.com", age: 30 },
      { name: "Vali Aliyev", email: "vali@example.com", age: 25 },
      { name: "Guli Karimova", email: "guli@example.com" }, // age NULL — for §NULL semantics
    ]);
    check("createMany returns the inserted rows in order", ali!.name === "Ali Valiyev" && guli!.name === "Guli Karimova");

    await postsRepo.createMany([
      { title: "A1", authorId: ali!.id },
      { title: "A2", authorId: ali!.id },
      { title: "G1", authorId: guli!.id },
    ]);

    /* ------------------------------- filters -------------------------------- */
    const filtered = await usersRepo.findAll({ filter: uf.or(uf.contains("name", "ali"), uf.endsWith("email", "example.com")) });
    check("nested and/or filter", filtered.length === 3, `${filtered.length}`);

    // Case-insensitivity is a parity requirement, not an accident.
    const ci = await usersRepo.findAll({ filter: [{ key: "name", operation: "%_%", value: "ALI" }] });
    check("contains is case-insensitive (matches drizzle's ILIKE)", ci.length === 2, `${ci.length}`);
    const cs = await usersRepo.findAll({ filter: [{ key: "name", operation: "like", value: "%ALI%" }] });
    check("like is case-sensitive", cs.length === 0, `${cs.length}`);
    const cil = await usersRepo.findAll({ filter: [{ key: "name", operation: "ilike", value: "%ALI%" }] });
    check("ilike is case-insensitive", cil.length === 2, `${cil.length}`);
    const pre = await usersRepo.findAll({ filter: [{ key: "name", operation: "like", value: "Ali%" }] });
    check("like 'Ali%' anchors at the start (no widening)", pre.length === 1 && pre[0]!.name === "Ali Valiyev");

    /* ------------- exact LIKE patterns ------------------------ */
    /* These are the patterns Prisma has no direct filter for; they are compiled
     * into an exact AND/NOT construction that pushes the raw pattern through
     * `startsWith`/`endsWith`. That works because Prisma does **not** escape
     * `%`/`_` inside a filter value — the single runtime assumption behind the
     * construction. If a future Prisma release starts escaping, these checks are
     * what will catch it, so keep them. */
    await usersRepo.createMany([
      { name: "50% off", email: "sale@example.com" },
      { name: "under_score", email: "us@example.com" },
    ]);

    const interior = await usersRepo.findAll({ filter: [{ key: "name", operation: "like", value: "Ali%v" }] });
    check("like with an interior % ('Ali%v')", interior.length === 1 && interior[0]!.name === "Ali Valiyev", interior.map(u => u.name).join("|"));

    const noTail = await usersRepo.findAll({ filter: [{ key: "name", operation: "like", value: "Ali%z" }] });
    check("…and it really anchors the tail ('Ali%z' matches nothing)", noTail.length === 0, `${noTail.length}`);

    const underscore = await usersRepo.findAll({ filter: [{ key: "name", operation: "like", value: "Ali_Valiyev" }] });
    check("like with a _ wildcard ('Ali_Valiyev')", underscore.length === 1, `${underscore.length}`);

    const pinned = await usersRepo.findAll({ filter: [{ key: "name", operation: "like", value: "Ali_Valiye" }] });
    check("…and the length is pinned ('Ali_Valiye' matches nothing)", pinned.length === 0, `${pinned.length}`);

    const litPercent = await usersRepo.findAll({ filter: [{ key: "name", operation: "like", value: "%50\\%%" }] });
    check("like with an escaped literal % ('%50\\%%')", litPercent.length === 1 && litPercent[0]!.name === "50% off", litPercent.map(u => u.name).join("|"));

    const litUnderscore = await usersRepo.findAll({ filter: [{ key: "name", operation: "like", value: "under\\_score" }] });
    check("like with an escaped literal _ ('under\\_score')", litUnderscore.length === 1, `${litUnderscore.length}`);

    const wildUnderscore = await usersRepo.findAll({ filter: [{ key: "name", operation: "like", value: "under_score" }] });
    check("…while an unescaped _ is a wildcard (still matches)", wildUnderscore.length === 1, `${wildUnderscore.length}`);

    const notInterior = await usersRepo.findAll({ filter: [{ key: "name", operation: "notLike", value: "Ali%v" }] });
    check("notLike with an interior % is the exact complement", notInterior.length === (await usersRepo.count()) - 1, `${notInterior.length}`);

    await usersRepo.deleteWhere([{ key: "email", operation: "in", value: ["sale@example.com", "us@example.com"] }]);

    // A wire string on an integer field must behave as it does on drizzle-pg.
    const wireNumber = await usersRepo.findAll({ filter: [{ key: "age", operation: ">=", value: "26" }] });
    check("wire string on an Int field works (no PrismaClientValidationError)", wireNumber.length === 1, `${wireNumber.length}`);

    /* --------------------- NULL semantics -------------------- */
    /* Postgres three-valued logic: every negation must exclude the NULL-age row. */
    const neq = await usersRepo.findAll({ filter: [{ key: "age", operation: "!=", value: 25 }] });
    check("!= excludes NULL rows", neq.length === 1 && neq[0]!.name === "Ali Valiyev", ids(neq));
    const notIn = await usersRepo.findAll({ filter: [{ key: "age", operation: "notIn", value: [25] }] });
    check("notIn excludes NULL rows", notIn.length === 1, `${notIn.length}`);
    const notBetween = await usersRepo.findAll({ filter: [{ key: "age", operation: "notBetween", value: [10, 26] }] });
    check("notBetween excludes NULL rows", notBetween.length === 1, `${notBetween.length}`);
    const notGroup = await usersRepo.findAll({ filter: { not: { key: "age", operation: "=", value: 25 } } });
    check("not(...) excludes NULL rows", notGroup.length === 1, `${notGroup.length}`);
    // "Ali Valiyev" and "Vali Aliyev" both contain "Ali" (the latter inside
    // "Aliyev"), so only "Guli Karimova" survives.
    const notLike = await usersRepo.findAll({ filter: [{ key: "name", operation: "notLike", value: "%Ali%" }] });
    check("notLike excludes every matching row", notLike.length === 1 && notLike[0]!.name === "Guli Karimova", notLike.map(u => u.name).join("|"));
    check("isNull finds the NULL-age row", (await usersRepo.findAll({ filter: [{ key: "age", operation: "isNull" }] })).length === 1);
    check("isNotNull finds the rest", (await usersRepo.findAll({ filter: [{ key: "age", operation: "isNotNull" }] })).length === 2);
    check("between is inclusive", (await usersRepo.findAll({ filter: [{ key: "age", operation: "between", value: [25, 30] }] })).length === 2);

    /* -------------------------------- sorting ------------------------------- */
    const sorted = await usersRepo.findAll({
      sort: [
        { key: "name", direction: "asc" },
        { key: "createdAt", direction: "desc" },
      ],
      columns: { name: true },
    });
    check("multi-field sort", sorted[0]!.name === "Ali Valiyev" && sorted[2]!.name === "Vali Aliyev");

    /* ------------------------------ pagination ------------------------------ */
    const list = await usersRepo.findList({ page: 1, perPage: 2 });
    check("offset pagination", list.data.length === 2 && list.meta.total_items === 3 && list.meta.has_next && !list.meta.has_prev);
    check("offset pagination: page 2", (await usersRepo.findList({ page: 2, perPage: 2 })).meta.has_prev);
    check("default perPage = 20 (core)", (await usersRepo.findList({})).meta.per_page === 20);
    const cfg = createRegistry(prisma, { defaultPerPage: 25 }).repository("user");
    check("registry option overrides default perPage", (await cfg.findList({})).meta.per_page === 25);

    const inf = await usersRepo.findInfinite({ limit: 2, offset: 0 });
    check("infinite scroll", inf.data.length === 2 && inf.meta.has_more && inf.meta.next_offset === 2);
    const infTail = await usersRepo.findInfinite({ limit: 2, offset: 2 });
    check("infinite scroll: last page", infTail.data.length === 1 && !infTail.meta.has_more && infTail.meta.next_offset === null);

    const c1 = await usersRepo.findCursor({ limit: 2, order: "asc" });
    check("cursor page 1", c1.data.length === 2 && c1.meta.has_next && !c1.meta.has_prev);
    const c2 = await usersRepo.findCursor({ limit: 2, cursor: c1.meta.next_cursor });
    check("cursor page 2 continues without overlap", c2.data.length === 1 && c2.data[0]!.id > c1.data[1]!.id, `${ids(c1.data)} → ${ids(c2.data)}`);
    check("cursor page 2 knows it has a previous page", c2.meta.has_prev);
    const back = await usersRepo.findCursor({ limit: 2, cursor: c2.meta.prev_cursor, direction: "backward" });
    check("cursor backward returns the earlier rows in ascending order", ids(back.data) === ids(c1.data), ids(back.data));
    const cCols = await usersRepo.findCursor({ limit: 2, columns: { name: true } });
    check("cursor with columns still produces a token", cCols.meta.next_cursor !== null && (cCols.data[0] as { name: string }).name.length > 0);
    // A keyset cursor must walk a **unique** field. The seed rows were inserted
    // by one `createMany`, so they share a `createdAt` to the microsecond — give
    // them distinct timestamps first, otherwise `createdAt > <tie>` legitimately
    // skips the tied rows and the test would be asserting a broken premise.
    const seeded = await usersRepo.findAll({ sort: [{ key: "id", direction: "asc" }] });
    for (const [i, u] of seeded.entries()) {
      await usersRepo.updateById(u.id, { createdAt: new Date(Date.UTC(2026, 0, i + 1)) } as never);
    }
    const cDate = await usersRepo.findCursor({ limit: 2, cursorKey: "createdAt" });
    const cDate2 = await usersRepo.findCursor({ limit: 2, cursorKey: "createdAt", cursor: cDate.meta.next_cursor });
    check(
      "cursor over a DateTime field (token re-cast)",
      cDate.data.length === 2 && cDate2.data.length === seeded.length - 2,
      `${cDate.data.length} then ${cDate2.data.length} of ${seeded.length}`,
    );

    /* ------------------------------- relations ------------------------------ */
    const withPosts = await usersRepo.findOne({ filter: [{ key: "id", value: ali!.id }], with: { posts: true } });
    check("include relation", withPosts?.posts.length === 2, `${withPosts?.posts.length}`);
    const bothSel = await usersRepo.findOne({ filter: [{ key: "id", value: ali!.id }], columns: { name: true }, with: { posts: true } });
    check("columns + with compose into one select", bothSel?.name === "Ali Valiyev" && bothSel?.posts.length === 2 && !("email" in (bothSel as object)));
    const rawRelation = await usersRepo.findAll({ filter: { posts: { some: { title: "G1" } } } });
    check("raw where escape hatch (relation predicate)", rawRelation.length === 1 && rawRelation[0]!.id === guli!.id);

    /* ------------------------- soft delete + updatedAt ---------------------- */
    const post = (await postsRepo.findAll({}))[0]!;
    const updated = await postsRepo.updateById(post.id, { title: "A1 edited" });
    check("updateById bumps updatedAt", updated?.title === "A1 edited" && updated?.updatedAt instanceof Date);

    const removed = await postsRepo.softDelete(post.id);
    check("softDelete sets deletedAt", removed?.deletedAt instanceof Date);
    check("soft-deleted rows disappear from reads", (await postsRepo.findAll({})).length === 2);
    check("withDeleted brings them back", (await postsRepo.findAll({ withDeleted: true })).length === 3);
    check("count honours the soft-delete guard", (await postsRepo.count()) === 2);
    const restored = await postsRepo.restore(post.id);
    check("restore clears deletedAt", restored?.deletedAt === null && (await postsRepo.findAll({})).length === 3);

    /* ---------------------------------- scope ------------------------------- */
    const aliPosts = postsRepo.scoped({ authorId: ali!.id });
    check("scoped reads are filtered", (await aliPosts.findAll({})).length === 2);
    const scopedNew = await aliPosts.create({ title: "A3" } as never);
    check("scoped create defaults the scope field", scopedNew.authorId === ali!.id);
    check("scoped count", (await aliPosts.count()) === 3);

    /* -------------------------------- upsert -------------------------------- */
    const up1 = await usersRepo.upsert({ name: "Ali Updated", email: "ali@example.com" }, { target: "email" });
    check("upsert updates on conflict", up1.id === ali!.id && up1.name === "Ali Updated");
    const up2 = await usersRepo.upsert({ name: "New Person", email: "new@example.com" }, { target: "email" });
    check("upsert inserts when there is no conflict", up2.id !== ali!.id && up2.email === "new@example.com");
    const many = await usersRepo.upsertMany(
      [
        { name: "Bulk A", email: "bulk-a@example.com" },
        { name: "Ali Bulk", email: "ali@example.com" },
      ],
      { target: "email" },
    );
    check("upsertMany returns rows in input order", many.length === 2 && many[0]!.email === "bulk-a@example.com" && many[1]!.id === ali!.id);

    /* ------------------------------- aggregate ------------------------------ */
    const byAuthor = (await postsRepo.aggregate({ count: true, groupBy: "authorId" })) as Array<{ authorId: number; count: number }>;
    check("aggregate count by group", byAuthor.length === 2 && byAuthor.reduce((n, r) => n + r.count, 0) === 4, JSON.stringify(byAuthor));
    const stats = (await usersRepo.aggregate({ count: true, avg: "age", min: "age", max: "age" })) as Array<Record<string, unknown>>;
    check("aggregate without groupBy → one row", stats.length === 1 && stats[0]!.min_age === 25 && stats[0]!.max_age === 30, JSON.stringify(stats[0]));

    /* ------------------------------ transactions ---------------------------- */
    const before = await usersRepo.count();
    try {
      await registry.transaction(async () => {
        await usersRepo.create({ name: "Rollback", email: "rollback@example.com" });
        throw new Error("boom");
      });
    } catch {
      /* expected */
    }
    check("transaction rollback", (await usersRepo.count()) === before, `${before}`);

    await registry.transaction(async () => {
      await usersRepo.create({ name: "Committed", email: "committed@example.com" });
    });
    check("transaction commit", (await usersRepo.count()) === before + 1);

    /* --------------------------- guards + strict ---------------------------- */
    const guarded = createRegistry(prisma).repository("user", { forcedColumns: { id: true, name: true } });
    const guardedRow = await guarded.findOne({ columns: { email: true } as never });
    check("forcedColumns keeps hidden fields out of the result", guardedRow !== undefined && !("email" in (guardedRow as object)));

    const skipped: string[] = [];
    const watched = createRegistry(prisma, { onSkippedCondition: i => skipped.push(`${i.site}:${i.key}:${i.reason}`) }).repository("user");
    await watched.findAll({ filter: [{ key: "nope", value: 1 }] });
    check("unknown key is reported through the hook", skipped.length === 1 && skipped[0] === "filter:nope:unknown-key", skipped.join("|"));

    const strict = createRegistry(prisma, { strict: true }).repository("user");
    let strictCode = "";
    try {
      await strict.findAll({ filter: [{ key: "nope", value: 1 }] });
    } catch (err) {
      strictCode = (err as { code?: string }).code ?? "";
    }
    check("strict mode throws QueryKitError", strictCode === "QUERYKIT_INVALID_CONDITION", strictCode);

    /* --------------------------------- delete ------------------------------- */
    const deleted = await usersRepo.deleteById(up2.id);
    check("deleteById returns the deleted row", deleted?.email === "new@example.com");
    const wiped = await postsRepo.deleteWhere([{ key: "title", operation: "%_%", value: "A" }]);
    check("deleteWhere returns the deleted rows", wiped.length >= 1, `${wiped.length}`);
  } finally {
    await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await prisma.$disconnect();
  }

  console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
