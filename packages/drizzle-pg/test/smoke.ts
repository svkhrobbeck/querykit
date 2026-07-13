/**
 * Real-DB smoke test for @querykit/drizzle-pg. Not published (see package.json
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

    // 4. infinite
    const inf = await usersRepo.findInfinite({ limit: 2, offset: 0 });
    check("infinite scroll", inf.data.length === 2 && inf.meta.has_more && inf.meta.next_offset === 2);

    // 5. cursor forward + backward
    const c1 = await usersRepo.findCursor({ limit: 2, order: "asc" });
    const c2 = await usersRepo.findCursor({ limit: 2, order: "asc", cursor: c1.meta.next_cursor });
    const back = await usersRepo.findCursor({ limit: 2, order: "asc", cursor: c2.meta.prev_cursor, direction: "backward" });
    check("cursor forward", c1.data.length === 2 && !c1.meta.has_prev && c1.meta.has_next);
    check("cursor backward returns first page", back.data.map(u => u.id).join() === c1.data.map(u => u.id).join());

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
