/**
 * Contract audit for @querykitjs/prisma-pg — **no database required**.
 *
 *   bun run test:contract
 *
 * Answers three questions with evidence rather than assertion:
 *
 *   A. Does this adapter **accept input** the same way drizzle-pg and mongoose do?
 *   B. Is it **used** the same way (exports, options, method names, call sequence)?
 *   C. Does the payload `@querykitjs/web` actually emits go through **without error**?
 *
 * It drives the real `@querykitjs/web` builders, pushes their output through
 * `JSON.parse(JSON.stringify(...))` (the wire), and feeds the result to all three
 * adapters' compilers. Their outputs are different by nature (SQL / Mongo /
 * Prisma), so equivalence is asserted against a **semantic label** per operator
 * rather than a literal shape.
 *
 * Cross-package source imports work because Node/Bun resolve a module's own
 * dependencies relative to that module — `../../drizzle-pg/src/...` finds its own
 * `drizzle-orm`.
 */
import { PrismaClient } from "./prisma/generated/index.js";

/* --- the adapter under audit --- */
import { createRegistry } from "../src/index";
import { readModelMeta } from "../src/internal/fields";
import { buildWhere as pWhere } from "../src/internal/where";
import { buildOrderBy as pOrderBy } from "../src/internal/order-by";
import { decodeCursor } from "../src/internal/cursor";
import type { OffsetParams, InfiniteParams, CursorParams } from "../src/types";

/* --- the two adapters it must agree with --- */
import { buildWhere as dWhere } from "../../drizzle-pg/src/internal/where";
import { buildOrderBy as dOrderBy } from "../../drizzle-pg/src/internal/order-by";
import { buildWhere as mWhere } from "../../mongoose/src/internal/where";
import { buildSort as mSort } from "../../mongoose/src/internal/order-by";

/* --- the frontend that must be able to talk to all of them --- */
import { buildListParams, buildInfiniteParams, buildCursorParams, createQuery } from "../../web/src/query";

/* Test-only fixtures owned by those packages, so their ORMs resolve there. */
import { users as usersTable, renderSql } from "../../drizzle-pg/test/fixtures";
import { User as UserModel } from "../../mongoose/test/user.model";

/* -------------------------------- runner ---------------------------------- */

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const show = (v: unknown) => JSON.stringify(v);
/** Simulate the HTTP wire: whatever survives JSON is what the backend receives. */
const overTheWire = <T>(payload: T): T => JSON.parse(JSON.stringify(payload)) as T;

/* ------------------------- one model, three adapters ----------------------- */

const prisma = new PrismaClient({ datasources: { db: { url: "postgresql://x:x@127.0.0.1:5432/x" } } });
const userMeta = readModelMeta(prisma as never, "user");

interface Call {
  method: string;
  args: Record<string, any>;
}
function spyClient(results: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const make =
    (method: string, fallback: unknown) =>
    (args: Record<string, any> = {}) => {
      calls.push({ method, args });
      return Promise.resolve(method in results ? results[method] : fallback);
    };
  const delegate = () => ({
    findMany: make("findMany", []),
    findFirst: make("findFirst", null),
    count: make("count", 0),
    create: make("create", {}),
    update: make("update", {}),
    updateMany: make("updateMany", { count: 0 }),
    delete: make("delete", {}),
    deleteMany: make("deleteMany", { count: 0 }),
    upsert: make("upsert", {}),
    aggregate: make("aggregate", {}),
    groupBy: make("groupBy", []),
  });
  const client: Record<string, unknown> = {
    _runtimeDataModel: (prisma as unknown as { _runtimeDataModel: unknown })._runtimeDataModel,
    user: delegate(),
    post: delegate(),
  };
  return { client, calls };
}
const lastArgs = (calls: Call[], method: string): Record<string, any> => [...calls].reverse().find(c => c.method === method)?.args ?? {};

/* ======================= A. input acceptance parity ======================== */

console.log("\n=== A1/A3. every operator is accepted by all three compilers ===");
{
  /** What the condition *means*, independent of SQL / Mongo / Prisma syntax. */
  const cases: Array<{ op: string; value: unknown; label: string }> = [
    { op: "=", value: 5, label: "eq" },
    { op: "eq", value: 5, label: "eq" },
    { op: "!=", value: 5, label: "ne" },
    { op: "ne", value: 5, label: "ne" },
    { op: ">", value: 5, label: "gt" },
    { op: "gt", value: 5, label: "gt" },
    { op: ">=", value: 5, label: "gte" },
    { op: "gte", value: 5, label: "gte" },
    { op: "<", value: 5, label: "lt" },
    { op: "lt", value: 5, label: "lt" },
    { op: "<=", value: 5, label: "lte" },
    { op: "lte", value: 5, label: "lte" },
    { op: "contains", value: "ali", label: "ci-contains" },
    { op: "%_%", value: "ali", label: "ci-contains" },
    { op: "startsWith", value: "ali", label: "ci-startsWith" },
    { op: "%_", value: "ali", label: "ci-startsWith" },
    { op: "endsWith", value: "ali", label: "ci-endsWith" },
    { op: "_%", value: "ali", label: "ci-endsWith" },
    { op: "like", value: "%ali%", label: "cs-contains" },
    { op: "ilike", value: "%ali%", label: "ci-contains" },
    { op: "notLike", value: "%ali%", label: "not-cs-contains" },
    { op: "in", value: [1, 2], label: "in" },
    { op: "notIn", value: [1, 2], label: "notIn" },
    { op: "between", value: [1, 9], label: "between" },
    { op: "notBetween", value: [1, 9], label: "notBetween" },
    { op: "isNull", value: undefined, label: "isNull" },
    { op: "isNotNull", value: undefined, label: "isNotNull" },
  ];

  // Text operators go on `name`, the rest on `age` (a number field) — the same
  // field choice for all three adapters so the comparison is apples-to-apples.
  const textOps = new Set(["contains", "%_%", "startsWith", "%_", "endsWith", "_%", "like", "ilike", "notLike"]);

  let accepted = 0;
  const rejected: string[] = [];
  for (const { op, value } of cases) {
    const key = textOps.has(op) ? "name" : "age";
    const condition = value === undefined ? { key, operation: op } : { key, operation: op, value };
    const filter = [condition] as never;

    const p = pWhere(userMeta, filter);
    const d = dWhere(usersTable, filter);
    const m = mWhere(UserModel as never, filter);

    if (p !== undefined && d !== undefined && m !== undefined) accepted++;
    else rejected.push(`${op}(p=${p !== undefined} d=${d !== undefined} m=${m !== undefined})`);
  }
  check(`all ${cases.length} operators are accepted by prisma-pg, drizzle-pg and mongoose`, rejected.length === 0, rejected.join(" "));

  // Case sensitivity is the one place a silent drift would be invisible: assert
  // the *rendered* form per adapter rather than trusting the table.
  const contains = [{ key: "name", operation: "%_%", value: "ali" }] as never;
  const ciPrisma = pWhere(userMeta, contains);
  const ciDrizzle = renderSql(dWhere(usersTable, contains)!);
  const ciMongo = mWhere(UserModel as never, contains) as Record<string, any>;
  check(
    "contains is case-insensitive in all three",
    eq(ciPrisma, { name: { contains: "ali", mode: "insensitive" } }) && /ilike/i.test(ciDrizzle.sql) && ciMongo.name.$options === "i",
    `drizzle=${ciDrizzle.sql}`,
  );

  const like = [{ key: "name", operation: "like", value: "%ali%" }] as never;
  const csPrisma = pWhere(userMeta, like);
  const csDrizzle = renderSql(dWhere(usersTable, like)!);
  const csMongo = mWhere(UserModel as never, like) as Record<string, any>;
  check(
    "like is case-sensitive in all three",
    eq(csPrisma, { name: { contains: "ali" } }) && /like/i.test(csDrizzle.sql) && !/ilike/i.test(csDrizzle.sql) && csMongo.name.$options === undefined,
    `drizzle=${csDrizzle.sql}`,
  );

  // The same LIKE pattern must select the same rows: drizzle sends `%ali%` to
  // SQL, prisma-pg translates it to `contains "ali"` — equivalent by definition.
  const anchored = [{ key: "name", operation: "like", value: "Ali%" }] as never;
  check(
    "an anchored LIKE means startsWith on prisma-pg and 'Ali%' on drizzle-pg",
    eq(pWhere(userMeta, anchored), { name: { startsWith: "Ali" } }) && renderSql(dWhere(usersTable, anchored)!).params.includes("Ali%"),
    show(renderSql(dWhere(usersTable, anchored)!).params),
  );
}

console.log("\n=== A4. the exact edge shapes @querykitjs/web emits ===");
{
  const { client, calls } = spyClient();
  const repo = createRegistry(client as never).repository("user" as never);

  // web always sends these, even when the user selected nothing.
  await repo.findAll({ filter: [], columns: {}, with: {} } as never);
  const args = lastArgs(calls, "findMany");
  check("filter: [] → no where", args.where === undefined);
  check("columns: {} → full row, NOT an empty select", args.select === undefined, show(args.select));
  check("with: {} → no include", args.include === undefined);

  // The same three shapes must mean the same thing on the other two adapters.
  check(
    "filter: [] → no where on drizzle-pg and mongoose too",
    dWhere(usersTable, [] as never) === undefined && mWhere(UserModel as never, [] as never) === undefined,
  );

  // isNull/isNotNull arrive with `value` omitted entirely (web strips it).
  await repo.findAll({ filter: [{ key: "age", operation: "isNull" }] } as never);
  check("a condition with no `value` (isNull) is accepted", eq(lastArgs(calls, "findMany").where, { age: { equals: null } }));

  // A cursor payload always carries `cursor: null` on the first page.
  const first = await repo.findCursor({ limit: 5, cursor: null } as never);
  check("cursor: null is treated as 'no cursor'", lastArgs(calls, "findMany").where === undefined && !first.meta.has_prev);

  // Query strings turn everything into strings.
  await repo.findAll({ filter: [{ key: "age", operation: ">=", value: "26" }] } as never);
  check(
    "a wire string on a numeric field is accepted (not a validation error)",
    eq(lastArgs(calls, "findMany").where, { age: { gte: 26 } }),
    show(lastArgs(calls, "findMany").where),
  );
  check(
    "...and drizzle-pg/mongoose accept it too",
    dWhere(usersTable, [{ key: "age", operation: ">=", value: "26" }] as never) !== undefined &&
      mWhere(UserModel as never, [{ key: "age", operation: ">=", value: "26" }] as never) !== undefined,
  );

  // web's default sort.
  const sortInput = [{ key: "createdAt", direction: "desc" as const }];
  check(
    "web's default sort resolves on all three",
    eq(pOrderBy(userMeta, sortInput as never), [{ createdAt: "desc" }]) &&
      dOrderBy(usersTable, sortInput as never).length === 1 &&
      eq(mSort(UserModel as never, sortInput as never), { createdAt: -1 }),
  );
}

/* ========================== B. usage parity =============================== */

console.log("\n=== B1/B4. exports and repository surface ===");
{
  const prismaExports = Object.keys(await import("../src/index")).sort();
  const drizzleExports = Object.keys(await import("../../drizzle-pg/src/index")).sort();
  const mongooseExports = Object.keys(await import("../../mongoose/src/index")).sort();
  check(
    "runtime exports identical across the three adapters",
    eq(prismaExports, drizzleExports) && eq(prismaExports, mongooseExports),
    `prisma=${show(prismaExports)} drizzle=${show(drizzleExports)} mongoose=${show(mongooseExports)}`,
  );

  const { client } = spyClient();
  const repo = createRegistry(client as never).repository("user" as never);
  const methods = Object.keys(repo)
    .filter(k => typeof (repo as Record<string, unknown>)[k] === "function")
    .sort();
  const expected = [
    "aggregate",
    "count",
    "create",
    "createMany",
    "deleteById",
    "deleteWhere",
    "exists",
    "findAll",
    "findById",
    "findCursor",
    "findInfinite",
    "findList",
    "findOne",
    "restore",
    "scoped",
    "softDelete",
    "upsert",
    "upsertMany",
    "updateById",
    "updateWhere",
  ].sort();
  check("repository exposes exactly the shared method set", eq(methods, expected), show(methods.filter(m => !expected.includes(m))));

  // The call sequence a user writes is identical; only the model handle differs.
  const registry = createRegistry(client as never);
  check(
    "createRegistry → repository → findList reads the same as the other adapters",
    typeof registry.repository === "function" && typeof registry.transaction === "function" && typeof repo.findList === "function",
  );
  check("registry exposes the client handle (drizzle exposes `schema`, mongoose the connection)", "client" in registry);
}

/* ================= C. @querykitjs/web → prisma-pg, end to end ============== */

console.log("\n=== C1–C3. real web payloads, over the wire, into the repository ===");
{
  const listPayload = overTheWire(
    buildListParams({
      filter: [
        { key: "name", operation: "%_%", value: "ali" },
        { key: "age", operation: ">=", value: 18 },
      ],
      sort: [{ key: "createdAt", direction: "desc" }],
      page: 2,
      perPage: 10,
    }),
  );
  check(
    "web list payload shape",
    eq(Object.keys(listPayload).sort(), ["columns", "filter", "page", "perPage", "sort", "with"]),
    show(Object.keys(listPayload)),
  );

  const { client, calls } = spyClient({ count: 42 });
  const repo = createRegistry(client as never).repository("user" as never);

  // The payload goes in with no cast and no massaging — that is the contract.
  const list = await repo.findList(listPayload as OffsetParams);
  const listArgs = lastArgs(calls, "findMany");
  check("web list payload is accepted without error", listArgs.take === 10 && listArgs.skip === 10);
  check(
    "…and compiles to the expected where",
    eq(listArgs.where, { AND: [{ name: { contains: "ali", mode: "insensitive" } }, { age: { gte: 18 } }] }),
    show(listArgs.where),
  );
  check("…and the expected orderBy", eq(listArgs.orderBy, [{ createdAt: "desc" }]));
  check("…and web's empty columns/with do not narrow the result", listArgs.select === undefined && listArgs.include === undefined);
  check(
    "…and the meta matches web's mapper contract",
    eq(Object.keys(list.meta).sort(), ["current_page", "has_next", "has_prev", "per_page", "total_items", "total_pages"]),
    show(Object.keys(list.meta)),
  );

  const infinitePayload = overTheWire(buildInfiniteParams({ filter: [{ key: "name", operation: "%_%", value: "a" }], limit: 5, offset: 10 }));
  const inf = await repo.findInfinite(infinitePayload as InfiniteParams);
  const infArgs = lastArgs(calls, "findMany");
  check("web infinite payload is accepted", infArgs.take === 6 && infArgs.skip === 10);
  check(
    "…and the meta matches web's mapper contract",
    eq(Object.keys(inf.meta).sort(), ["count", "has_more", "limit", "next_offset", "offset"]),
    show(Object.keys(inf.meta)),
  );

  const cursorPayload = overTheWire(buildCursorParams({ filter: [], limit: 5, cursor: null, order: "desc" }));
  check(
    "web cursor payload shape",
    eq(Object.keys(cursorPayload).sort(), ["columns", "cursor", "direction", "filter", "limit", "order", "with"]),
    show(Object.keys(cursorPayload)),
  );
  const cur = await repo.findCursor(cursorPayload as CursorParams);
  check("web cursor payload is accepted", eq(lastArgs(calls, "findMany").orderBy, [{ id: "desc" }]) && lastArgs(calls, "findMany").take === 6);
  check(
    "…and the meta matches web's mapper contract",
    eq(Object.keys(cur.meta).sort(), ["has_next", "has_prev", "limit", "next_cursor", "prev_cursor"]),
    show(Object.keys(cur.meta)),
  );

  // A second page: the token this adapter issues must survive the wire and come back.
  const s2 = spyClient({ findMany: [{ id: 7 }, { id: 8 }, { id: 9 }] });
  const repo2 = createRegistry(s2.client as never).repository("user" as never);
  const p1 = await repo2.findCursor(overTheWire(buildCursorParams({ limit: 2 })) as CursorParams);
  const p2Payload = overTheWire(buildCursorParams({ limit: 2, cursor: p1.meta.next_cursor }));
  await repo2.findCursor(p2Payload as CursorParams);
  check(
    "a token issued here round-trips through web's cursor builder",
    eq(lastArgs(s2.calls, "findMany").where, { id: { gt: 8 } }),
    show(lastArgs(s2.calls, "findMany").where),
  );
  check("…and the token itself is opaque base64url", typeof p1.meta.next_cursor === "string" && decodeCursor(p1.meta.next_cursor) === 8);

  // A custom-configured frontend (different field names are a web-side concern,
  // but the default builders must keep working).
  const q = createQuery({ defaultPerPage: 25 });
  const custom = overTheWire(q.list({ filter: [] })) as OffsetParams;
  const customList = await repo.findList(custom);
  check("createQuery-configured payload is accepted", customList.meta.per_page === 25, `${customList.meta.per_page}`);
}

console.log("\n=== C5. PrismaInclude (web's typed `with` for this adapter) ===");
{
  const { client, calls } = spyClient();
  const repo = createRegistry(client as never).repository("user" as never);

  // Every field web's `PrismaInclude` allows must survive into the query.
  const include = { posts: { select: { title: true }, where: { published: true }, orderBy: { createdAt: "desc" }, take: 5, skip: 1 } };
  await repo.findAll({ with: include } as never);
  check("PrismaInclude passes through as `include`", eq(lastArgs(calls, "findMany").include, include), show(lastArgs(calls, "findMany").include));

  await repo.findAll({ columns: { id: true }, with: include } as never);
  check("…and survives the select composition unchanged", eq(lastArgs(calls, "findMany").select, { id: true, ...include }));
}

console.log("\n=== C4. meta field names match @querykitjs/web's mappers ===");
{
  // web maps snake_case wire meta → camelCase. Read the mapper source and check
  // that every field it reads is one this adapter actually produces.
  const metaSource = await Bun.file(new URL("../../web/src/meta.ts", import.meta.url)).text();
  const produced = new Set([
    "total_items",
    "total_pages",
    "current_page",
    "per_page",
    "has_next",
    "has_prev",
    "limit",
    "offset",
    "count",
    "has_more",
    "next_offset",
    "next_cursor",
    "prev_cursor",
  ]);
  const read = [...metaSource.matchAll(/\bmeta\??\.([a-z_]+)/g)].map(m => m[1]!).filter(f => f.includes("_"));
  const missing = [...new Set(read)].filter(f => !produced.has(f));
  check("every snake_case meta field web reads is produced by this adapter", missing.length === 0, missing.join(","));
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
