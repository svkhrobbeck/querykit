/**
 * Read-path smoke test for the Mongoose adapter (stage 1). Spins up an
 * in-memory MongoDB replica set (mongodb-memory-server) — no external DB needed
 * — connects Mongoose, seeds User/Post, then exercises every read feature and
 * checks the results mirror the Drizzle adapter's behaviour.
 *
 *   bun run src/mongo-service/test/smoke.ts
 *
 * First run downloads a mongod binary (may be slow on a poor connection).
 */
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

import { createRegistry, createFilters } from "../src/index";
import { User, type IUser } from "./user.model";
import { Post } from "./post.model";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}

async function main() {
  const replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri(), { dbName: "qk_smoke" });

  const registry = createRegistry(mongoose.connection);
  const usersRepo = registry.repository(User);
  const postsRepo = registry.repository(Post);
  const uf = createFilters<IUser>();

  try {
    await User.deleteMany({});
    await Post.deleteMany({});

    // seed (writes via raw Mongoose — adapter writes land in stage 2)
    const [ali, , guli] = await User.create([
      { name: "Ali Valiyev", email: "ali@example.com", age: 30 },
      { name: "Vali Aliyev", email: "vali@example.com", age: null },
      { name: "Guli Karimova", email: "guli@example.com", age: 25 },
    ]);
    await Post.create([
      { title: "A1", author: ali!._id },
      { title: "A2", author: ali!._id },
      { title: "G1", author: guli!._id },
    ]);

    // 1. nested and/or filter (contains / endsWith, case-insensitive)
    const filtered = await usersRepo.findAll({
      filter: uf.or(uf.contains("name", "ali"), uf.endsWith("email", "example.com")),
    });
    check("nested or filter (contains/endsWith)", filtered.length === 3, `${filtered.length}`);

    // 2. multi-field sort + columns projection
    const sorted = await usersRepo.findAll({
      sort: [
        { key: "name", direction: "asc" },
        { key: "createdAt", direction: "desc" },
      ],
      columns: { name: true },
    });
    check("multi-field sort", sorted[0]!.name === "Ali Valiyev" && sorted[2]!.name === "Vali Aliyev");
    check("columns projection drops unselected", !("email" in (sorted[0] as unknown as Record<string, unknown>)));

    // 3. offset pagination
    const list = await usersRepo.findList({ page: 1, perPage: 2 });
    check("offset pagination", list.data.length === 2 && list.meta.total_items === 3 && list.meta.has_next);

    // 3b. default perPage = 20 (core); configurable via registry options
    const defList = await usersRepo.findList({});
    check("default perPage = 20 (core)", defList.meta.per_page === 20);
    const cfgRepo = createRegistry(mongoose.connection, { defaultPerPage: 25 }).repository(User);
    check("registry option overrides default perPage", (await cfgRepo.findList({})).meta.per_page === 25);

    // 4. infinite
    const inf = await usersRepo.findInfinite({ limit: 2, offset: 0 });
    check("infinite scroll", inf.data.length === 2 && inf.meta.has_more && inf.meta.next_offset === 2);

    // 5. cursor forward + backward (default cursorKey = _id)
    const c1 = await usersRepo.findCursor({ limit: 2, order: "asc" });
    const c2 = await usersRepo.findCursor({ limit: 2, order: "asc", cursor: c1.meta.next_cursor });
    const back = await usersRepo.findCursor({ limit: 2, order: "asc", cursor: c2.meta.prev_cursor, direction: "backward" });
    check("cursor forward", c1.data.length === 2 && !c1.meta.has_prev && c1.meta.has_next);
    check(
      "cursor backward returns first page",
      back.data.map(u => String(u._id)).join() === c1.data.map(u => String(u._id)).join(),
      back.data.map(u => u.name).join(),
    );

    // 5b. cursor with columns omitting id (cursor field force-included)
    const cCols = await usersRepo.findCursor({ limit: 2, order: "asc", columns: { name: true } });
    const cCols2 = await usersRepo.findCursor({ limit: 2, order: "asc", cursor: cCols.meta.next_cursor, columns: { name: true } });
    check(
      "cursor works with columns omitting id",
      cCols.meta.next_cursor !== null && cCols2.data.length > 0 && cCols2.data.map(u => u.name).join() !== cCols.data.map(u => u.name).join(),
    );

    // 6. with (populate) relation
    const withRel = await postsRepo.findAll({ with: { author: true }, sort: [{ key: "title", direction: "asc" }] });
    const author = (withRel[0] as { author?: { name?: string } }).author;
    check("with relation populated", Boolean(author && author.name), author?.name ?? "none");

    // 7. between + in filters
    const now = new Date();
    const past = new Date(now.getTime() - 60_000);
    const future = new Date(now.getTime() + 60_000);
    const between = await usersRepo.findAll({ filter: uf.between("createdAt", past, future) });
    check("between filter", between.length === 3, `${between.length}`);
    const inNames = await usersRepo.findAll({ filter: uf.in("name", ["Ali Valiyev", "Guli Karimova"]) });
    check("in filter", inNames.length === 2, `${inNames.length}`);

    // 8. scope (only guli's posts) — scope wins as a base filter
    const scoped = postsRepo.scoped({ author: guli!._id as never });
    const scopedPosts = await scoped.findAll({});
    check("scoped base filter", scopedPosts.length === 1 && scopedPosts[0]!.title === "G1", `${scopedPosts.length}`);

    // 9. soft-delete guard + withDeleted
    const active = await postsRepo.count();
    await Post.updateOne({ title: "A1" }, { deletedAt: new Date() });
    check("soft-deleted excluded by default", (await postsRepo.count()) === active - 1);
    check("withDeleted includes soft-deleted", (await postsRepo.findAll({ withDeleted: true })).length === active);

    // 10. count / exists
    check("count", (await usersRepo.count()) === 3);
    check("exists true", (await usersRepo.exists(uf.eq("email", "ali@example.com"))) === true);
    check("exists false", (await usersRepo.exists(uf.eq("email", "nobody@example.com"))) === false);

    // 11. findById + findOne
    const byId = await usersRepo.findById(ali!._id);
    check("findById", byId?.name === "Ali Valiyev");
    const one = await usersRepo.findOne({ filter: uf.eq("email", "guli@example.com") });
    check("findOne", one?.name === "Guli Karimova");

    /* ---- contract robustness: sort forms + string values from the wire ---- */

    // 12. sort [{ key, direction }] — the array shape the backend receives
    const wireAsc = await usersRepo.findAll({ sort: [{ key: "name", direction: "asc" }], columns: { name: true } });
    check("sort [{ key: name, asc }]", wireAsc[0]!.name === "Ali Valiyev" && wireAsc[2]!.name === "Vali Aliyev");
    const wireDesc = await usersRepo.findAll({ sort: [{ key: "name", direction: "desc" }], columns: { name: true } });
    check("sort [{ key: name, desc }]", wireDesc[0]!.name === "Vali Aliyev" && wireDesc[2]!.name === "Ali Valiyev");

    // 13. string id — the frontend sends ids as JSON strings (Mongoose casts to ObjectId)
    const byStringId = await usersRepo.findById(String(guli!._id));
    check("findById with string id", byStringId?.name === "Guli Karimova");
    // `id` is a wire alias for `_id` (runtime); typed code uses `_id`, so cast the key.
    const idFilter = await usersRepo.findAll({ filter: [{ key: "id" as never, operation: "=", value: String(ali!._id) }] });
    check("filter id=<string> aliases _id + casts", idFilter.length === 1 && idFilter[0]!.name === "Ali Valiyev");

    // 14. string date value — frontend sends dates as ISO strings (Mongoose casts to Date)
    const isoPast = new Date(Date.now() - 60_000).toISOString();
    const dateStr = await usersRepo.findAll({ filter: [{ key: "createdAt", operation: ">=", value: isoPast }] });
    check("filter createdAt >= <ISO string> casts to Date", dateStr.length === 3, `${dateStr.length}`);

    // 15. empty result + page beyond the last page
    const empty = await usersRepo.findList({ filter: [{ key: "name", operation: "=", value: "nobody" }] });
    check("empty result meta", empty.data.length === 0 && empty.meta.total_items === 0 && !empty.meta.has_next && !empty.meta.has_prev);
    const beyond = await usersRepo.findList({ page: 99, perPage: 2 });
    check("page beyond end", beyond.data.length === 0 && beyond.meta.has_prev && !beyond.meta.has_next);

    // 15b. columns projection excludes _id unless selected (no silent id leak)
    const proj1 = (await usersRepo.findAll({ columns: { name: true } }))[0] as unknown as Record<string, unknown>;
    check("columns excludes _id + email (no leak)", Boolean(proj1) && !("_id" in proj1) && !("email" in proj1) && "name" in proj1);
    const proj2 = (await usersRepo.findAll({ columns: { id: true, name: true } }))[0] as unknown as Record<string, unknown>;
    check("columns includes _id when selected", Boolean(proj2) && "_id" in proj2);

    // 15c. flat filter array may hold a logical group (implicit AND) — like drizzle-pg
    const grouped = await usersRepo.findAll({
      filter: [
        {
          or: [
            { key: "name", operation: "=", value: "Ali Valiyev" },
            { key: "name", operation: "=", value: "Guli Karimova" },
          ],
        },
        { key: "email", operation: "_%", value: "example.com" },
      ] as never,
    });
    check("flat array holds or-group (AND email)", grouped.length === 2, `${grouped.length}`);

    // 15d. negation/inequality excludes NULL rows — SQL semantics, like drizzle-pg.
    //      ages: Ali=30, Vali=null, Guli=25
    const neAge = await usersRepo.findAll({ filter: uf.ne("age", 30) });
    check("ne excludes value AND null", neAge.length === 1 && neAge[0]!.name === "Guli Karimova", neAge.map(u => u.name).join());
    const notInAge = await usersRepo.findAll({ filter: uf.notIn("age", [30]) });
    check("notIn excludes value AND null", notInAge.length === 1 && notInAge[0]!.name === "Guli Karimova");
    const notBetweenAge = await usersRepo.findAll({ filter: [{ key: "age", operation: "notBetween", value: [20, 28] }] as never });
    check("notBetween excludes range AND null", notBetweenAge.length === 1 && notBetweenAge[0]!.name === "Ali Valiyev", notBetweenAge.map(u => u.name).join());
    const notNullAge = await usersRepo.findAll({ filter: uf.isNotNull("age") });
    check("isNotNull excludes null", notNullAge.length === 2, notNullAge.map(u => u.name).join());
    const isNullAge = await usersRepo.findAll({ filter: uf.isNull("age") });
    check("isNull matches null", isNullAge.length === 1 && isNullAge[0]!.name === "Vali Aliyev");
    // not-group: SQL NOT(age > 26) excludes both matches (Ali=30) AND null rows
    // (Vali) under three-valued logic → only Guli(25). Bare $nor would wrongly
    // keep the null row.
    const notGtAge = await usersRepo.findAll({ filter: uf.not(uf.gt("age", 26)) });
    check("not(gt) excludes matching AND null", notGtAge.length === 1 && notGtAge[0]!.name === "Guli Karimova", notGtAge.map(u => u.name).join());
    // but not(isNotNull) is two-valued → must still MATCH the null row (no guard).
    const notIsNotNull = await usersRepo.findAll({ filter: uf.not(uf.isNotNull("age")) });
    check(
      "not(isNotNull) matches null (no over-guard)",
      notIsNotNull.length === 1 && notIsNotNull[0]!.name === "Vali Aliyev",
      notIsNotNull.map(u => u.name).join(),
    );

    /* ---- extender (custom methods) + typed relations at runtime ---- */

    // 16. extender fn adds a custom method (drizzle-pg style)
    const uExt = registry.repository(User, base => ({
      findByEmail: (email: string) => base.findOne({ filter: [{ key: "email", operation: "=", value: email }] }),
    }));
    check("extender custom method (findByEmail)", (await uExt.findByEmail("ali@example.com"))?.name === "Ali Valiyev");

    // 17. relations + extender together
    const pRel = registry.repository(Post, { relations: { author: User } }, base => ({
      byTitle: (t: string) => base.findOne({ filter: [{ key: "title", operation: "=", value: t }] }),
    }));
    const pr = await pRel.findOne({ filter: [{ key: "title", operation: "=", value: "A2" }], with: { author: true } });
    check("relations repo: with populate", Boolean((pr as { author?: { name?: string } })?.author?.name));
    check("relations repo: custom method (byTitle)", (await pRel.byTitle("G1"))?.title === "G1");

    /* ============================ STAGE 2: writes ========================== */

    // create + createMany (auto _id + timestamps)
    const created = await usersRepo.create({ name: "New User", email: "new@example.com", age: 40 });
    check("create returns doc (+_id, createdAt)", created.name === "New User" && Boolean(created._id) && created.createdAt instanceof Date);
    const many = await usersRepo.createMany([
      { name: "M1", email: "m1@x.com", age: 1 },
      { name: "M2", email: "m2@x.com", age: 2 },
    ]);
    check("createMany", many.length === 2 && many[0]!.name === "M1");

    // updateById (+ updatedAt bump) and updateWhere
    await new Promise(res => setTimeout(res, 15));
    const updated = await usersRepo.updateById(created._id, { name: "Renamed" });
    check("updateById returns updated + bumps updatedAt", updated?.name === "Renamed" && updated.updatedAt > created.updatedAt);
    const uw = await usersRepo.updateWhere(uf.in("name", ["M1", "M2"]), { age: 99 });
    check("updateWhere returns updated docs", uw.length === 2 && uw.every(u => u.age === 99));

    // upsert: insert, then update-on-conflict
    const up1 = await usersRepo.upsert({ name: "Ups", email: "ups@x.com", age: 5 }, { target: "email" });
    check("upsert inserts", up1.name === "Ups" && up1.age === 5);
    const up2 = await usersRepo.upsert({ name: "Ups2", email: "ups@x.com", age: 6 }, { target: "email" });
    check("upsert updates on conflict (same _id)", String(up2._id) === String(up1._id) && up2.name === "Ups2");
    const upm = await usersRepo.upsertMany(
      [
        { name: "UM1", email: "ups@x.com", age: 7 },
        { name: "UM2", email: "um2@x.com", age: 8 },
      ],
      { target: "email" },
    );
    check(
      "upsertMany returns in input order (1 update + 1 insert)",
      upm.length === 2 && upm[0]!.email === "ups@x.com" && upm[1]!.email === "um2@x.com" && upm[0]!.name === "UM1",
      upm.map(u => u.email).join(),
    );

    // aggregate: count / avg / groupBy
    const agg1 = await usersRepo.aggregate({ count: true, avg: "age" });
    check("aggregate count + avg", (agg1[0]?.count as number) > 0 && typeof agg1[0]?.avg_age === "number");
    const agg2 = await postsRepo.aggregate({ count: true, groupBy: "author" });
    check("aggregate groupBy", agg2.length >= 1 && "author" in agg2[0]! && "count" in agg2[0]!, `${agg2.length} groups`);
    const isoPast2 = new Date(Date.now() - 60_000).toISOString();
    const aggCast = await usersRepo.aggregate({ count: true, filter: [{ key: "createdAt", operation: ">=", value: isoPast2 }] });
    check("aggregate $match casts wire strings (date)", (aggCast[0]?.count as number) > 0, `count=${aggCast[0]?.count}`);

    // deleteById + deleteWhere
    const del = await usersRepo.deleteById(created._id);
    check("deleteById returns deleted + gone", del?.name === "Renamed" && (await usersRepo.findById(created._id)) === undefined);
    const delW = await usersRepo.deleteWhere(uf.in("name", ["M1", "M2"]));
    check("deleteWhere returns deleted", delW.length === 2);

    // softDelete + restore (Post has a deletedAt path)
    const sp = await postsRepo.create({ title: "SoftMe", author: ali!._id });
    const sd = await postsRepo.softDelete(sp._id);
    check("softDelete sets deletedAt + hides", Boolean(sd?.deletedAt) && (await postsRepo.findById(sp._id)) === undefined);
    check("withDeleted still finds it", Boolean(await postsRepo.findById(sp._id, { withDeleted: true })));
    const rs = await postsRepo.restore(sp._id);
    check("restore clears deletedAt + shows", rs?.deletedAt === null && Boolean(await postsRepo.findById(sp._id)));

    // transaction: rollback then commit (needs a replica set — memory-server provides one)
    const before = await usersRepo.count();
    try {
      await registry.transaction(async () => {
        await usersRepo.create({ name: "TxRollback", email: "txr@x.com", age: 1 });
        throw new Error("boom");
      });
    } catch {
      /* expected */
    }
    check("transaction rollback", (await usersRepo.count()) === before);
    await registry.transaction(async () => {
      await usersRepo.create({ name: "TxCommit", email: "txc@x.com", age: 1 });
    });
    check("transaction commit", (await usersRepo.count()) === before + 1);
  } finally {
    await mongoose.disconnect();
    await replset.stop();
  }

  console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
