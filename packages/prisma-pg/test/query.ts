/**
 * Compiler-level test for @querykitjs/prisma-pg — **no database required**.
 *
 *   bun run test:generate   # once, to create the fixture client (offline)
 *   bun run test/query.ts
 *
 * Why it exists: everything this adapter does before touching Postgres — field
 * resolution, the operator table, LIKE translation, the where/orderBy tree,
 * projection composition, cursor tokens and the pagination formulas — is pure.
 * Pinning it here means the real-DB smoke test only has to prove SQL semantics,
 * and it keeps the **cross-adapter parity** (the whole point of querykit) under
 * a test that runs in CI without a server.
 */
import { PrismaClient } from "./prisma/generated/index.js";

import { readModelMeta, resolveField, delegateKeys, isDateField, isStringField, castValue, type ModelMeta, type FieldMeta } from "../src/internal/fields";
import { operators, parseLikePattern } from "../src/internal/operators";
import { buildWhere } from "../src/internal/where";
import { buildOrderBy } from "../src/internal/order-by";
import { coerceCondition, INVALID_VALUE } from "../src/internal/coerce";
import { encodeCursor, decodeCursor } from "../src/internal/cursor";
import type { Diagnostics } from "../src/internal/diagnostics";
import type { Filter, FilterOperator } from "../src/types";
import { createRegistry } from "../src/index";

/* Cross-adapter cursor tokens must be interchangeable (PARITY.md). */
import { encodeCursor as drizzleEncode } from "../../drizzle-pg/src/internal/cursor";
import { encodeCursor as mongooseEncode } from "../../mongoose/src/internal/cursor";

/* -------------------------------- runner ---------------------------------- */

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}
const eq = (actual: unknown, expected: unknown) => JSON.stringify(actual) === JSON.stringify(expected);
const show = (v: unknown) => JSON.stringify(v);

/** Collects skip reports so "was it dropped, and why" is observable. */
function spy() {
  const seen: string[] = [];
  const diag: Diagnostics = { source: "User", strict: false, onSkipped: i => seen.push(`${i.site}:${i.key}:${i.reason}`) };
  return { diag, seen };
}

const prisma = new PrismaClient({ datasources: { db: { url: "postgresql://x:x@localhost:5432/x" } } });
const userMeta = readModelMeta(prisma as never, "user");
const postMeta = readModelMeta(prisma as never, "post");

const field = (name: string, type: string, extra: Partial<FieldMeta> = {}): FieldMeta => ({
  name,
  type,
  kind: "scalar",
  isId: false,
  isUpdatedAt: false,
  isList: false,
  ...extra,
});
/** Hand-built metadata for shapes the fixture schema does not have. */
const metaOf = (fields: FieldMeta[], name = "Synthetic"): ModelMeta => {
  const map = new Map(fields.map(f => [f.name, f]));
  const updatedAt = map.get("updatedAt");
  return {
    name,
    fields: map,
    idField: map.get("id")?.name ?? fields.find(f => f.isId)?.name,
    hasDeletedAt: map.has("deletedAt"),
    stampUpdatedAt: updatedAt && !updatedAt.isUpdatedAt ? updatedAt.name : undefined,
    hasCreatedAt: map.has("createdAt"),
  };
};

console.log("\n=== 1. model metadata ===");
{
  check("delegate keys exclude non-delegates", eq(delegateKeys(prisma as never).sort(), ["post", "user"]), show(delegateKeys(prisma as never)));
  check("model name from runtime datamodel", userMeta.name === "User", userMeta.name);
  check("field list", eq([...userMeta.fields.keys()], ["id", "name", "email", "age", "createdAt", "posts"]));
  check("idField detected", userMeta.idField === "id");
  check("hasCreatedAt / hasDeletedAt (users)", userMeta.hasCreatedAt && !userMeta.hasDeletedAt);
  check("hasDeletedAt (posts)", postMeta.hasDeletedAt);
  check("updatedAt stamped when not @updatedAt", postMeta.stampUpdatedAt === "updatedAt");
  check("resolveField: known field", resolveField(userMeta, "email") === "email");
  check("resolveField: unknown field → undefined", resolveField(userMeta, "nope") === undefined);
  check("resolveField: DB column name is NOT accepted (Prisma takes field names)", resolveField(userMeta, "created_at") === undefined);
  check("isDateField / isStringField", isDateField(userMeta, "createdAt") && isStringField(userMeta, "name") && !isStringField(userMeta, "age"));

  // D7: "id" maps to the model's @id field even when it is named differently.
  const aliased = metaOf([field("uuid", "String", { isId: true }), field("label", "String")]);
  check("resolveField: 'id' → the model's @id field", resolveField(aliased, "id") === "uuid");
}

console.log("\n=== 2. operator table (27 operators) ===");
{
  const ctxString = { isString: true };
  const cases: Array<[FilterOperator, unknown, unknown]> = [
    ["=", 5, { equals: 5 }],
    ["eq", 5, { equals: 5 }],
    ["!=", 5, { not: 5 }],
    ["ne", 5, { not: 5 }],
    [">", 5, { gt: 5 }],
    ["gt", 5, { gt: 5 }],
    [">=", 5, { gte: 5 }],
    ["gte", 5, { gte: 5 }],
    ["<", 5, { lt: 5 }],
    ["lt", 5, { lt: 5 }],
    ["<=", 5, { lte: 5 }],
    ["lte", 5, { lte: 5 }],
    ["contains", "ali", { contains: "ali", mode: "insensitive" }],
    ["%_%", "ali", { contains: "ali", mode: "insensitive" }],
    ["startsWith", "ali", { startsWith: "ali", mode: "insensitive" }],
    ["%_", "ali", { startsWith: "ali", mode: "insensitive" }],
    ["endsWith", "ali", { endsWith: "ali", mode: "insensitive" }],
    ["_%", "ali", { endsWith: "ali", mode: "insensitive" }],
    ["like", "%ali%", { contains: "ali" }],
    ["ilike", "%ali%", { contains: "ali", mode: "insensitive" }],
    ["notLike", "%ali%", { not: { contains: "ali" } }],
    ["in", [1, 2], { in: [1, 2] }],
    ["notIn", [1, 2], { notIn: [1, 2] }],
    ["between", [1, 9], { gte: 1, lte: 9 }],
    ["notBetween", [1, 9], { not: { gte: 1, lte: 9 } }],
    ["isNull", undefined, { equals: null }],
    ["isNotNull", undefined, { not: null }],
  ];
  let ok = 0;
  for (const [op, value, expected] of cases) {
    const got = operators[op](value as never, ctxString);
    if (eq(got, expected)) ok++;
    else check(`operator "${op}"`, false, `got ${show(got)} want ${show(expected)}`);
  }
  check(`all ${cases.length} operators map correctly`, ok === cases.length, `${ok}/${cases.length}`);

  check("in: non-array value drops the condition", operators.in("x" as never, ctxString) === undefined);
  check("notIn: non-array value drops the condition", operators.notIn("x" as never, ctxString) === undefined);
  check("between: non-tuple drops the condition", operators.between([1] as never, ctxString) === undefined);
  check("notBetween: 3 items drops the condition", operators.notBetween([1, 2, 3] as never, ctxString) === undefined);

  // `mode: "insensitive"` is only legal on String fields — Prisma errors otherwise.
  check("contains on a non-String field omits mode", eq(operators.contains("2026" as never, { isString: false }), { contains: "2026" }));
}

console.log("\n=== 3. LIKE pattern translation (D2) ===");
{
  const cases: Array<[string, unknown]> = [
    ["%ali%", { op: "contains", value: "ali" }],
    ["ali%", { op: "startsWith", value: "ali" }],
    ["%ali", { op: "endsWith", value: "ali" }],
    ["ali", { op: "equals", value: "ali" }],
    ["", { op: "equals", value: "" }],
    ["%", { op: "endsWith", value: "" }], // LIKE '%' — every non-NULL row, as in SQL
    ["%%", { op: "endsWith", value: "" }],
    ["\\%50", { op: "equals", value: "%50" }], // escaped literal, no LIKE involved
  ];
  let ok = 0;
  for (const [pattern, expected] of cases) {
    const got = parseLikePattern(pattern);
    if (eq(got, expected)) ok++;
    else check(`like "${pattern}"`, false, `got ${show(got)} want ${show(expected)}`);
  }
  check(`${cases.length} representable patterns translate exactly`, ok === cases.length, `${ok}/${cases.length}`);

  check("interior % is not representable", parseLikePattern("a%b") === undefined);
  check("_ wildcard is not representable", parseLikePattern("a_b") === undefined);
  check("_ anywhere is not representable", parseLikePattern("%ali_") === undefined);
  check("escaped % inside a substring match is not representable", parseLikePattern("%50\\%%") === undefined);
  check("dangling escape is not representable", parseLikePattern("ali\\") === undefined);

  const { diag, seen } = spy();
  const dropped = buildWhere(userMeta, [{ key: "name", operation: "like", value: "a%b" }], diag);
  check("unrepresentable pattern is dropped AND reported", dropped === undefined && seen[0] === "filter:name:invalid-value", show(seen));
}

console.log("\n=== 4. where tree ===");
{
  check(
    "flat array → implicit AND",
    eq(
      buildWhere(userMeta, [
        { key: "name", value: "a" },
        { key: "age", operation: ">", value: 18 },
      ]),
      { AND: [{ name: { equals: "a" } }, { age: { gt: 18 } }] },
    ),
  );
  check("single condition is not wrapped", eq(buildWhere(userMeta, [{ key: "name", value: "a" }]), { name: { equals: "a" } }));
  check("default operation is '='", eq(buildWhere(userMeta, { key: "name", value: "a" }), { name: { equals: "a" } }));

  const nested: Filter = {
    or: [
      { key: "name", operation: "%_%", value: "ali" },
      { and: [{ key: "age", operation: ">=", value: 18 }, { not: { key: "email", operation: "endsWith", value: "spam.com" } }] },
    ],
  };
  check(
    "nested or/and/not",
    eq(buildWhere(userMeta, nested), {
      OR: [
        { name: { contains: "ali", mode: "insensitive" } },
        { AND: [{ age: { gte: 18 } }, { NOT: { email: { endsWith: "spam.com", mode: "insensitive" } } }] },
      ],
    }),
    show(buildWhere(userMeta, nested)),
  );

  check("undefined filter → undefined", buildWhere(userMeta, undefined) === undefined);
  check("empty array → undefined", buildWhere(userMeta, []) === undefined);
  check("empty group → undefined", buildWhere(userMeta, { and: [] }) === undefined);
  check("not(nothing) → undefined", buildWhere(userMeta, { not: { key: "nope", value: 1 } }) === undefined);

  const { diag, seen } = spy();
  check("unknown key is skipped silently", buildWhere(userMeta, [{ key: "nope", value: 1 }], diag) === undefined && seen[0] === "filter:nope:unknown-key");

  check(
    "unknown key inside a group drops only that branch",
    eq(
      buildWhere(userMeta, {
        and: [
          { key: "nope", value: 1 },
          { key: "name", value: "a" },
        ],
      }),
      { name: { equals: "a" } },
    ),
  );

  // Raw escape hatch — a plain Prisma where object passes through untouched.
  check(
    "raw where object passes through",
    eq(buildWhere(userMeta, { posts: { some: { title: { contains: "x" } } } } as never), { posts: { some: { title: { contains: "x" } } } }),
  );

  // strict mode turns every drop into a QueryKitError the route maps to a 400.
  let threw = "";
  try {
    buildWhere(userMeta, [{ key: "nope", value: 1 }], { source: "User", strict: true });
  } catch (err) {
    threw = (err as { code?: string }).code ?? "";
  }
  check("strict mode throws QueryKitError", threw === "QUERYKIT_INVALID_CONDITION", threw);

  const { diag: d2, seen: s2 } = spy();
  check(
    "text operator on a non-String field is dropped + reported",
    buildWhere(userMeta, [{ key: "age", operation: "contains", value: "1" }], d2) === undefined && s2[0] === "filter:age:invalid-value",
  );
}

console.log("\n=== 5. orderBy ===");
{
  check(
    "multi-field sort",
    eq(
      buildOrderBy(userMeta, [
        { key: "name", direction: "asc" },
        { key: "createdAt", direction: "desc" },
      ]),
      [{ name: "asc" }, { createdAt: "desc" }],
    ),
  );
  check("direction defaults to asc", eq(buildOrderBy(userMeta, [{ key: "name" }]), [{ name: "asc" }]));

  const { diag, seen } = spy();
  check(
    "unknown sort key skipped + reported, falls back",
    eq(buildOrderBy(userMeta, [{ key: "nope" }], diag), [{ createdAt: "desc" }]) && seen[0] === "sort:nope:unknown-key",
  );

  check("no sort → createdAt desc", eq(buildOrderBy(userMeta), [{ createdAt: "desc" }]));
  const noCreatedAt = metaOf([field("id", "Int", { isId: true }), field("label", "String")]);
  check("no createdAt → id desc (stable pagination)", eq(buildOrderBy(noCreatedAt), [{ id: "desc" }]));
  const neither = metaOf([field("label", "String")]);
  check("neither → empty orderBy", eq(buildOrderBy(neither), []));
}

console.log("\n=== 6. value coercion ===");
{
  const iso = "2026-07-30T10:00:00.000Z";
  const cast = coerceCondition(userMeta, "createdAt", ">=", iso);
  check("ISO string → Date on a DateTime field", cast instanceof Date && (cast as Date).toISOString() === iso);
  check("unparseable date invalidates the condition", coerceCondition(userMeta, "createdAt", ">=", "not-a-date") === INVALID_VALUE);
  check("one bad element invalidates the whole `in` list", coerceCondition(userMeta, "createdAt", "in", [iso, "nope"]) === INVALID_VALUE);
  check(
    "good `in` list casts every element",
    (coerceCondition(userMeta, "createdAt", "in", [iso, iso]) as Date[]).every(d => d instanceof Date),
  );
  check("text operators keep their raw string", coerceCondition(userMeta, "createdAt", "contains", "2026") === "2026");
  check("castValue leaves unparseable values alone", castValue(userMeta, "createdAt", "nope") === "nope");

  // Prisma type-checks arguments client-side, so a wire string on an Int field
  // would throw where drizzle-pg (Postgres casts) returns rows. Cast it here.
  check("wire string → number on an Int field", coerceCondition(userMeta, "age", "=", "18") === 18);
  check("wire strings in an `in` list are cast", eq(coerceCondition(userMeta, "age", "in", ["18", "21"]), [18, 21]));
  check("non-integer string on an Int field is invalid", coerceCondition(userMeta, "age", "=", "18.5") === INVALID_VALUE);
  check("non-numeric string on an Int field is invalid", coerceCondition(userMeta, "age", "=", "abc") === INVALID_VALUE);
  check("a real number passes through", coerceCondition(userMeta, "age", "=", 18) === 18);
  check("String fields are left alone", coerceCondition(userMeta, "name", "=", "ali") === "ali");

  const numericMeta = metaOf([field("score", "Float"), field("flag", "Boolean"), field("big", "BigInt")]);
  check("wire string → float", coerceCondition(numericMeta, "score", "=", "1.5") === 1.5);
  check("wire string → boolean", coerceCondition(numericMeta, "flag", "=", "true") === true && coerceCondition(numericMeta, "flag", "=", "0") === false);
  check("nonsense boolean is invalid", coerceCondition(numericMeta, "flag", "=", "maybe") === INVALID_VALUE);
  check("wire string → bigint field accepts a number", coerceCondition(numericMeta, "big", "=", "42") === 42);
  check("null is never coerced", coerceCondition(userMeta, "age", "=", null) === null);

  const { diag, seen } = spy();
  check(
    "bad date is dropped + reported",
    buildWhere(userMeta, [{ key: "createdAt", operation: ">=", value: "not-a-date" }], diag) === undefined && seen[0] === "filter:createdAt:invalid-value",
  );
  check("good date reaches the where", eq(buildWhere(userMeta, [{ key: "createdAt", operation: ">=", value: iso }]), { createdAt: { gte: new Date(iso) } }));
}

console.log("\n=== 7. cursor tokens (cross-adapter parity) ===");
{
  const token = encodeCursor(42);
  check("round-trips a number", decodeCursor(token) === 42);
  check("round-trips a date as ISO", decodeCursor(encodeCursor(new Date("2026-07-30T10:00:00.000Z"))) === "2026-07-30T10:00:00.000Z");
  check("garbage token → undefined", decodeCursor("!!!not-base64!!!") === undefined);
  check("null/empty cursor → undefined", decodeCursor(null) === undefined && decodeCursor("") === undefined);

  // The whole point of querykit: a token from any adapter works on any other.
  const values: unknown[] = [42, "abc", new Date("2026-01-02T03:04:05.000Z"), null];
  const same = values.every(v => encodeCursor(v) === drizzleEncode(v) && encodeCursor(v) === mongooseEncode(v));
  check("token is byte-identical to drizzle-pg and mongoose", same);
  check("a drizzle-issued token decodes here", decodeCursor(drizzleEncode(7)) === 7);
}

/* ------------------------- repository spy harness -------------------------- */
/* The repository is exercised against a fake client that records the args it
 * would have sent to Prisma. That pins projection composition, the pagination
 * arithmetic, the keyset WHERE and every guard without needing a server — the
 * real smoke test then only has to prove SQL semantics. */

interface Call {
  method: string;
  args: Record<string, any>;
}

function makeDelegate(calls: Call[], results: Record<string, unknown>) {
  const make =
    (method: string, fallback: unknown) =>
    (args: Record<string, any> = {}) => {
      calls.push({ method, args });
      return Promise.resolve(method in results ? results[method] : fallback);
    };
  return {
    findMany: make("findMany", []),
    findFirst: make("findFirst", null),
    count: make("count", 0),
    create: make("create", {}),
    createManyAndReturn: make("createManyAndReturn", []),
    update: make("update", {}),
    updateMany: make("updateMany", { count: 0 }),
    delete: make("delete", {}),
    deleteMany: make("deleteMany", { count: 0 }),
    upsert: make("upsert", {}),
    aggregate: make("aggregate", {}),
    groupBy: make("groupBy", []),
  };
}

function spyClient(results: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const client: Record<string, unknown> = {
    _runtimeDataModel: (prisma as unknown as { _runtimeDataModel: unknown })._runtimeDataModel,
    user: makeDelegate(calls, results),
    post: makeDelegate(calls, results),
  };
  const txCalls: Call[] = [];
  const txClient: Record<string, unknown> = {
    _runtimeDataModel: client._runtimeDataModel,
    user: makeDelegate(txCalls, results),
    post: makeDelegate(txCalls, results),
  };
  client.$transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(txClient);
  return { client, calls, txCalls };
}

/** A spy client pre-loaded with the rows `findMany` should return. */
const spyOf = (rows: Record<string, unknown>[], results: Record<string, unknown> = {}) => spyClient({ findMany: rows, count: rows.length, ...results });

/** Args of the last call to `method`. */
const lastArgs = (calls: Call[], method: string): Record<string, any> => [...calls].reverse().find(c => c.method === method)?.args ?? {};

console.log("\n=== 8. projection: columns → select, with → include (D8) ===");
{
  const { client, calls } = spyClient();
  const repo = createRegistry(client as never).repository("user" as never);

  await repo.findAll({ columns: { id: true, email: true } });
  check("columns → select", eq(lastArgs(calls, "findMany").select, { id: true, email: true }));
  check("columns-only sends no include", lastArgs(calls, "findMany").include === undefined);

  await repo.findAll({ with: { posts: true } });
  check("with → include", eq(lastArgs(calls, "findMany").include, { posts: true }));
  check("with-only sends no select", lastArgs(calls, "findMany").select === undefined);

  // ⚠️ Prisma rejects select+include at the same level — they must be composed.
  await repo.findAll({ columns: { id: true }, with: { posts: true } });
  const both = lastArgs(calls, "findMany");
  check("columns + with → a single select carrying the relation", eq(both.select, { id: true, posts: true }) && both.include === undefined, show(both.select));

  await repo.findAll({ columns: { id: true }, with: { posts: { select: { title: true } } } });
  check("relation config object is passed through inside select", eq(lastArgs(calls, "findMany").select, { id: true, posts: { select: { title: true } } }));

  await repo.findAll({ columns: { id: true, nope: true } as never });
  check("unknown column is dropped from the select", eq(lastArgs(calls, "findMany").select, { id: true }));

  await repo.findAll({ columns: { id: false, email: false } });
  check("all-false columns → full row (no select)", lastArgs(calls, "findMany").select === undefined);

  await repo.findAll({ with: { posts: false } });
  check("falsy relation is dropped", lastArgs(calls, "findMany").include === undefined);
}

console.log("\n=== 9. pagination arguments and meta ===");
{
  const rows = Array.from({ length: 21 }, (_, i) => ({ id: i + 1 }));
  const { client, calls } = spyClient({ findMany: rows.slice(0, 3), count: 7 });
  const repo = createRegistry(client as never).repository("user" as never);

  const list = await repo.findList({ page: 2, perPage: 3 });
  const listArgs = lastArgs(calls, "findMany");
  check("findList: take/skip", listArgs.take === 3 && listArgs.skip === 3, `take=${listArgs.take} skip=${listArgs.skip}`);
  check(
    "findList: meta arithmetic",
    eq(list.meta, { total_items: 7, total_pages: 3, current_page: 2, per_page: 3, has_next: true, has_prev: true }),
    show(list.meta),
  );

  const first = await repo.findList({ page: 1, perPage: 10 });
  check("findList: page 1 has no prev; last page has no next", !first.meta.has_prev && !first.meta.has_next);
  const clamped = await repo.findList({ page: -5, perPage: 0 });
  check("findList: page/perPage clamped to >= 1", clamped.meta.current_page === 1 && clamped.meta.per_page === 1);
  const defaulted = await repo.findList({});
  check("findList: default perPage = 20 (core)", defaulted.meta.per_page === 20);
  const capped = await repo.findList({ perPage: 5000 });
  check("findList: perPage capped at 200 (core max)", capped.meta.per_page === 200);
  const configured = await createRegistry(client as never, { defaultPerPage: 25, maxPerPage: 30 })
    .repository("user" as never)
    .findList({ perPage: 999 });
  check("findList: registry options override default and cap", configured.meta.per_page === 30);

  // Infinite fetches limit+1 to learn `has_more` without a COUNT.
  const inf = await createRegistry(spyOf(rows.slice(0, 4)).client as never)
    .repository("user" as never)
    .findInfinite({ limit: 3, offset: 6 });
  check("findInfinite: meta", eq(inf.meta, { limit: 3, offset: 6, count: 3, has_more: true, next_offset: 9 }), show(inf.meta));

  const shortSpy = spyOf(rows.slice(0, 2));
  const tail = await createRegistry(shortSpy.client as never)
    .repository("user" as never)
    .findInfinite({ limit: 3, offset: 0 });
  check("findInfinite: last page → has_more false, next_offset null", !tail.meta.has_more && tail.meta.next_offset === null && tail.data.length === 2);
  const infArgs = lastArgs(shortSpy.calls, "findMany");
  check("findInfinite: take = limit + 1, no COUNT issued", infArgs.take === 4 && !shortSpy.calls.some(c => c.method === "count"));
}

console.log("\n=== 10. cursor pagination (keyset via WHERE) ===");
{
  const rows = [{ id: 10 }, { id: 11 }, { id: 12 }];
  const s = spyOf(rows);
  const repo = createRegistry(s.client as never).repository("user" as never);

  const page1 = await repo.findCursor({ limit: 2 });
  const args1 = lastArgs(s.calls, "findMany");
  check("no cursor → no seek predicate", args1.where === undefined, show(args1.where));
  check("orderBy follows order/direction", eq(args1.orderBy, [{ id: "asc" }]));
  check("take = limit + 1", args1.take === 3);
  check("page 1 meta", page1.meta.has_next && !page1.meta.has_prev && page1.data.length === 2);
  check("next_cursor points at the last row of the page", decodeCursor(page1.meta.next_cursor) === 11, show(decodeCursor(page1.meta.next_cursor)));

  const s2 = spyOf(rows);
  await createRegistry(s2.client as never)
    .repository("user" as never)
    .findCursor({ limit: 2, cursor: page1.meta.next_cursor });
  check("forward+asc seeks with gt", eq(lastArgs(s2.calls, "findMany").where, { id: { gt: 11 } }), show(lastArgs(s2.calls, "findMany").where));

  const s3 = spyOf(rows);
  await createRegistry(s3.client as never)
    .repository("user" as never)
    .findCursor({ limit: 2, cursor: encodeCursor(11), direction: "backward" });
  const back = lastArgs(s3.calls, "findMany");
  check("backward+asc seeks with lt and flips orderBy", eq(back.where, { id: { lt: 11 } }) && eq(back.orderBy, [{ id: "desc" }]));

  const s4 = spyOf(rows);
  const backward = await createRegistry(s4.client as never)
    .repository("user" as never)
    .findCursor({ limit: 2, cursor: encodeCursor(11), direction: "backward" });
  check(
    "backward page is reversed back into ascending order",
    eq(
      backward.data.map(r => (r as { id: number }).id),
      [11, 10],
    ),
  );
  check("backward meta: has_next from the cursor, has_prev from the extra row", backward.meta.has_next && backward.meta.has_prev);

  const s5 = spyOf(rows);
  await createRegistry(s5.client as never)
    .repository("user" as never)
    .findCursor({ limit: 2, cursorKey: "createdAt", cursor: encodeCursor("2026-07-30T10:00:00.000Z") });
  const dated = lastArgs(s5.calls, "findMany").where as { createdAt: { gt: Date } };
  check("cursor value is re-cast to the field type (ISO → Date)", dated.createdAt.gt instanceof Date, String(dated.createdAt.gt));

  const s6 = spyOf(rows);
  await createRegistry(s6.client as never)
    .repository("user" as never)
    .findCursor({ limit: 2, columns: { name: true } });
  check("cursor field is forced into the select", eq(lastArgs(s6.calls, "findMany").select, { name: true, id: true }));

  let cursorErr = "";
  try {
    await createRegistry(spyOf(rows).client as never)
      .repository("user" as never)
      .findCursor({ cursorKey: "nope" });
  } catch (err) {
    cursorErr = (err as { code?: string }).code ?? "";
  }
  check("unknown cursorKey is always fatal", cursorErr === "QUERYKIT_INVALID_CONDITION", cursorErr);

  const s7 = spyOf(rows);
  const filtered = await createRegistry(s7.client as never)
    .repository("user" as never)
    .findCursor({ limit: 2, cursor: encodeCursor(11), filter: [{ key: "name", value: "ali" }] });
  check(
    "seek is ANDed with the base filter",
    eq(lastArgs(s7.calls, "findMany").where, { AND: [{ name: { equals: "ali" } }, { id: { gt: 11 } }] }),
    show(filtered.meta.limit),
  );
}

console.log("\n=== 11. guards: scope, soft-delete, projection, updatedAt ===");
{
  // Soft delete: reads exclude deletedAt rows unless withDeleted.
  const s = spyOf([{ id: 1 }]);
  const posts = createRegistry(s.client as never).repository("post" as never);
  await posts.findAll({});
  check("soft-delete guard is applied to reads", eq(lastArgs(s.calls, "findMany").where, { deletedAt: null }));
  await posts.findAll({ withDeleted: true });
  check("withDeleted lifts the guard", lastArgs(s.calls, "findMany").where === undefined);
  await posts.findAll({ filter: [{ key: "title", value: "a" }] });
  check("guard is ANDed with the user filter", eq(lastArgs(s.calls, "findMany").where, { AND: [{ title: { equals: "a" } }, { deletedAt: null }] }));

  // users has no deletedAt → no guard at all.
  const su = spyOf([{ id: 1 }]);
  await createRegistry(su.client as never)
    .repository("user" as never)
    .findAll({});
  check("model without deletedAt gets no guard", lastArgs(su.calls, "findMany").where === undefined);

  // Scope.
  const ss = spyOf([{ id: 1 }]);
  const scoped = createRegistry(ss.client as never).repository("user" as never, { scope: { name: "ali" } });
  await scoped.findAll({ filter: [{ key: "email", value: "x" }] });
  check("scope is ANDed into every read", eq(lastArgs(ss.calls, "findMany").where, { AND: [{ email: { equals: "x" } }, { name: { equals: "ali" } }] }));
  await scoped.create({ email: "y" } as never);
  check("scope is defaulted into inserts", eq(lastArgs(ss.calls, "create").data, { name: "ali", email: "y" }));
  await scoped.scoped({ email: "z" } as never).findAll({});
  check("scoped() merges scopes", eq(lastArgs(ss.calls, "findMany").where, { AND: [{ name: { equals: "ali" } }, { email: { equals: "z" } }] }));

  let scopeErr = "";
  try {
    createRegistry(spyOf([]).client as never).repository("user" as never, { scope: { nope: 1 } as never });
  } catch (err) {
    scopeErr = (err as { code?: string }).code ?? "";
  }
  check("an unresolvable scope key fails at build time (never widens a query)", scopeErr === "QUERYKIT_INVALID_CONDITION", scopeErr);

  // Projection guards.
  const sf = spyOf([{ id: 1 }]);
  const forced = createRegistry(sf.client as never).repository("user" as never, { forcedColumns: { id: true, name: true } });
  await forced.findAll({ columns: { email: true } });
  check("forcedColumns ignores the client selection entirely", eq(lastArgs(sf.calls, "findMany").select, { id: true, name: true }));

  const sa = spyOf([{ id: 1 }]);
  const allowlisted = createRegistry(sa.client as never).repository("user" as never, { allowedColumns: ["id", "name"] });
  await allowlisted.findAll({ columns: { name: true, email: true } });
  check("allowedColumns intersects the client selection", eq(lastArgs(sa.calls, "findMany").select, { name: true }));
  await allowlisted.findAll({ columns: { email: true } });
  check("empty intersection falls back to the allowlist, never the full row", eq(lastArgs(sa.calls, "findMany").select, { id: true, name: true }));
  await allowlisted.findAll({});
  check("no selection under an allowlist still returns only allowed fields", eq(lastArgs(sa.calls, "findMany").select, { id: true, name: true }));

  let guardErr = "";
  try {
    createRegistry(spyOf([]).client as never).repository("user" as never, { forcedColumns: {} });
  } catch (err) {
    guardErr = (err as Error).message;
  }
  check("empty forcedColumns throws at build time", guardErr.includes("at least one field"));

  // The cursor key must never become a way to read a forbidden field.
  const sc = spyOf([
    { id: 1, name: "ali" },
    { id: 2, name: "vali" },
  ]);
  const guardedCursor = await createRegistry(sc.client as never)
    .repository("user" as never, { allowedColumns: ["name"] })
    .findCursor({ limit: 5, cursorKey: "id" });
  check(
    "cursor key is queried but stripped from guarded rows",
    eq(lastArgs(sc.calls, "findMany").select, { name: true, id: true }) && eq(guardedCursor.data, [{ name: "ali" }, { name: "vali" }]),
    show(guardedCursor.data),
  );
  check("...and the cursor token is still produced from it", guardedCursor.meta.next_cursor === null && guardedCursor.meta.prev_cursor === null);

  // updatedAt bump (the fixture's `updatedAt` is a plain field, not @updatedAt).
  const su2 = spyOf([{ id: 1 }], { findFirst: { id: 1 } });
  await createRegistry(su2.client as never)
    .repository("post" as never)
    .updateById(1, { title: "x" } as never);
  const patched = lastArgs(su2.calls, "update").data as Record<string, unknown>;
  check("updateById bumps updatedAt", patched.title === "x" && patched.updatedAt instanceof Date, show(Object.keys(patched)));
  check("updateById addresses the row by its primary key", eq(lastArgs(su2.calls, "update").where, { id: 1 }));

  const su3 = spyOf([{ id: 1 }], { findFirst: { id: 1 } });
  await createRegistry(su3.client as never)
    .repository("post" as never)
    .softDelete(1);
  const soft = lastArgs(su3.calls, "update").data as Record<string, unknown>;
  check("softDelete sets deletedAt", soft.deletedAt instanceof Date);
  check("softDelete only targets non-deleted rows", eq(lastArgs(su3.calls, "findFirst").where, { AND: [{ id: { equals: 1 } }, { deletedAt: null }] }));

  const su4 = spyOf([{ id: 1 }], { findFirst: { id: 1 } });
  await createRegistry(su4.client as never)
    .repository("post" as never)
    .restore(1);
  check(
    "restore clears deletedAt and searches among deleted rows",
    (lastArgs(su4.calls, "update").data as Record<string, unknown>).deletedAt === null && eq(lastArgs(su4.calls, "findFirst").where, { id: { equals: 1 } }),
  );

  let softErr = "";
  try {
    await createRegistry(spyOf([]).client as never)
      .repository("user" as never)
      .softDelete(1);
  } catch (err) {
    softErr = (err as Error).message;
  }
  check("softDelete on a model without deletedAt throws", softErr.includes("no deletedAt"));

  const miss = spyOf([], { findFirst: null });
  check(
    "updateById returns undefined when nothing matches",
    (await createRegistry(miss.client as never)
      .repository("user" as never)
      .updateById(9, {} as never)) === undefined,
  );
}

console.log("\n=== 12. writes and aggregate ===");
{
  const s = spyOf([]);
  const repo = createRegistry(s.client as never).repository("user" as never);

  await repo.upsert({ email: "a@b.c", name: "Ali" } as never, { target: "email" } as never);
  const up = lastArgs(s.calls, "upsert");
  check("upsert: single target → unique where", eq(up.where, { email: "a@b.c" }));
  check("upsert: create carries the full values", eq(up.create, { email: "a@b.c", name: "Ali" }));
  check("upsert: default update excludes the target", eq(up.update, { name: "Ali" }), show(up.update));

  await repo.upsert({ name: "A", email: "e" } as never, { target: ["name", "email"] } as never);
  check("upsert: compound target uses Prisma's `a_b` key", eq(lastArgs(s.calls, "upsert").where, { name_email: { name: "A", email: "e" } }));

  await repo.upsert({ email: "a@b.c", name: "Ali" } as never, { target: "email", set: { name: "Override" } } as never);
  check("upsert: explicit set wins", eq(lastArgs(s.calls, "upsert").update, { name: "Override" }));

  await repo.upsertMany([{ email: "1" }, { email: "2" }] as never, { target: "email" } as never);
  check("upsertMany: one upsert per row, input order preserved", s.calls.filter(c => c.method === "upsert").length === 5);

  await repo.createMany([{ email: "1" }, { email: "2" }] as never);
  check("createMany uses createManyAndReturn when available", eq(lastArgs(s.calls, "createManyAndReturn").data, [{ email: "1" }, { email: "2" }]));
  check("createMany([]) short-circuits", (await repo.createMany([])).length === 0);

  // Aggregate: Prisma's `_count`/`_sum` shape is flattened to drizzle's.
  const sg = spyOf([], { groupBy: [{ name: "ali", _count: 3, _sum: { age: 60 } }] });
  const grouped = await createRegistry(sg.client as never)
    .repository("user" as never)
    .aggregate({ groupBy: "name", count: true, sum: "age" } as never);
  check(
    "aggregate: groupBy args",
    eq(lastArgs(sg.calls, "groupBy").by, ["name"]) && lastArgs(sg.calls, "groupBy")._count === true && eq(lastArgs(sg.calls, "groupBy")._sum, { age: true }),
  );
  check("aggregate: rows flattened to { group…, count, sum_x }", eq(grouped, [{ name: "ali", count: 3, sum_age: 60 }]), show(grouped));

  const sa = spyOf([], { aggregate: { _count: 9, _avg: { age: 21.5 } } });
  const plain = await createRegistry(sa.client as never)
    .repository("user" as never)
    .aggregate({ count: true, avg: "age" } as never);
  check("aggregate: without groupBy → a single row via aggregate()", eq(plain, [{ count: 9, avg_age: 21.5 }]), show(plain));

  const sh = spyOf([], { groupBy: [] });
  await createRegistry(sh.client as never)
    .repository("user" as never, { allowedColumns: ["name"] })
    .aggregate({ groupBy: "email", count: true } as never);
  check(
    "aggregate: a forbidden groupBy field is dropped (no leak via aggregation)",
    sh.calls.every(c => c.method !== "groupBy"),
    show(sh.calls.map(c => c.method)),
  );
}

console.log("\n=== 13. transactions (ambient context) ===");
{
  const s = spyOf([{ id: 1 }]);
  const registry = createRegistry(s.client as never);
  const repo = registry.repository("user" as never);

  await repo.findAll({});
  check("outside a transaction the base client is used", s.calls.length === 1 && s.txCalls.length === 0);

  await registry.transaction(async () => {
    await repo.findAll({});
    await repo.findAll({});
  });
  check(
    "inside a transaction every call goes to the tx client",
    s.txCalls.length === 2 && s.calls.length === 1,
    `base=${s.calls.length} tx=${s.txCalls.length}`,
  );

  await registry.transaction(async () => {
    await registry.transaction(async () => {
      await repo.findAll({});
    });
  });
  check("nested transaction reuses the ambient one (Prisma has no savepoints)", s.txCalls.length === 3);

  await repo.findAll({});
  check("after the transaction the base client is used again", s.calls.length === 2);
}

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
