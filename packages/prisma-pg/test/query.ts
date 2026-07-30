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

console.log(`\n${failed === 0 ? "✅" : "❌"} ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
