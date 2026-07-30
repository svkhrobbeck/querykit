/**
 * Smoke test for @querykitjs/class-validator — validates the querykit request
 * contract with real class-validator + class-transformer. No network.
 *
 * `bun run --filter @querykitjs/class-validator test:smoke`
 *
 * NOTE: the script runs from ./.bun so bun picks up ./.bun/tsconfig.json — bun
 * only reads the root of an `extends` chain, so it would otherwise drop
 * `experimentalDecorators`. See ./.bun/tsconfig.json for the full reasoning.
 */
import "reflect-metadata";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { plainToInstance } from "class-transformer";
import { validateSync, type ValidatorOptions } from "class-validator";
import { FILTER_OPERATORS } from "@querykitjs/core";
import {
  BaseParamsDto,
  CursorParamsDto,
  DEFAULT_MAX_FILTER_DEPTH,
  InfiniteParamsDto,
  OffsetParamsDto,
  QUERYKIT_LOCALES,
  QUERYKIT_MESSAGES_EN,
  QUERYKIT_MESSAGES_RU,
  QUERYKIT_MESSAGES_UZ,
  formatMessage,
  localizeIssue,
  makeCursorParamsDto,
  makeInfiniteParamsDto,
  makeOffsetParamsDto,
  validateFilter,
  validateSort,
} from "../src/index";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}

/** `plainToInstance` + `validateSync` — DTO qatlamini bir qatorda ishga tushiradi. */
const run = <T extends object>(cls: new () => T, payload: unknown, options?: ValidatorOptions) => {
  const instance = plainToInstance(cls, payload);
  return { instance: instance as Record<string, unknown>, errors: validateSync(instance as object, options ?? {}) };
};

const messageOf = (errors: ReturnType<typeof validateSync>, constraint = "isQueryFilter") => errors[0]?.constraints?.[constraint] ?? "";

/* ===================== 1. pure core — filter contract ====================== */

check(
  "nested and/or/not + between/in/isNull",
  validateFilter({
    and: [
      { key: "status", operation: "=", value: "active" },
      {
        or: [
          { key: "age", operation: "between", value: [18, 65] },
          { key: "role", operation: "in", value: ["admin", "owner"] },
        ],
      },
      { not: { key: "deletedAt", operation: "isNull" } },
    ],
  }).length === 0,
);

check(
  "flat filter array (implicit AND)",
  validateFilter([
    { key: "name", operation: "%_%", value: "ali" },
    { key: "status", operation: "=", value: "active" },
  ]).length === 0,
);

/* Har bir core operatori qabul qilinadi — ro'yxat core'dan aylanadi, ya'ni
 * core'ga yangi operator qo'shilsa bu test avtomatik qamraydi. */
const rejectedOperators = FILTER_OPERATORS.filter(op => validateFilter({ key: "x", operation: op, value: "v" }).length > 0);
check(`all ${FILTER_OPERATORS.length} core operators accepted`, rejectedOperators.length === 0, rejectedOperators.join(", "));

check("legacy `type` field ignored, not rejected", validateFilter({ key: "createdAt", operation: ">=", value: "2026-01-01", type: "date" }).length === 0);
check("invalid operator rejected", validateFilter({ key: "x", operation: "LIKESQL" })[0]?.key === "querykit.filter.invalid_operator");
check("missing key rejected", validateFilter({ operation: "=", value: "v" })[0]?.key === "querykit.filter.missing_key");
check("empty object rejected", validateFilter({})[0]?.key === "querykit.filter.missing_key");
check("group inside a flat array rejected", validateFilter([{ and: [{ key: "a" }] }])[0]?.key === "querykit.filter.missing_key");
check("non-array and-group rejected", validateFilter({ and: "x" })[0]?.key === "querykit.filter.invalid_group");
check("undefined filter is valid (optional field)", validateFilter(undefined).length === 0);

/* Wire qiymati — Date/NaN/Infinity yo'q (JSON'da sana ISO string). */
check("Date value rejected (wire is JSON)", validateFilter({ key: "a", value: new Date() })[0]?.key === "querykit.filter.invalid_value");
check("NaN value rejected", validateFilter({ key: "a", value: NaN })[0]?.key === "querykit.filter.invalid_value");
check("Infinity value rejected", validateFilter({ key: "a", value: Infinity })[0]?.key === "querykit.filter.invalid_value");
check("nested array value rejected", validateFilter({ key: "a", value: [[1, 2]] })[0]?.key === "querykit.filter.invalid_value");
check("null value accepted", validateFilter({ key: "a", value: null }).length === 0);
check("scalar array value accepted", validateFilter({ key: "a", operation: "in", value: ["x", 1, true, null] }).length === 0);

/* ========================== 2. allowedKeys layer ========================== */

check("allowedKeys rejects an unknown key", validateFilter({ key: "a" }, { allowedKeys: ["b"] })[0]?.key === "querykit.filter.unknown_key");
check("allowedKeys names the offending key", validateFilter({ key: "a" }, { allowedKeys: ["b"] })[0]?.args.key === "a");
check("allowedKeys accepts a listed key", validateFilter({ key: "b" }, { allowedKeys: ["b"] }).length === 0);
check("without allowedKeys any key passes", validateFilter({ key: "whatever" }).length === 0);
check(
  "allowedKeys reaches nested groups",
  validateFilter({ and: [{ or: [{ key: "nope" }] }] }, { allowedKeys: ["b"] })[0]?.key === "querykit.filter.unknown_key",
);

/* `[]` is deny-all, and deliberately NOT the same as `undefined` (allow-all):
 * an allowlist computed from an empty column set must fail closed. */
check("allowedKeys: [] denies every filter key", validateFilter({ key: "a" }, { allowedKeys: [] })[0]?.key === "querykit.filter.unknown_key");
check("allowedKeys: [] denies every sort key", validateSort([{ key: "a" }], { allowedKeys: [] })[0]?.key === "querykit.sort.unknown_key");
check("allowedKeys: [] still accepts an empty filter", validateFilter([], { allowedKeys: [] }).length === 0);

/* ============================= 3. maxDepth =============================== */

const deep = (levels: number): unknown => (levels === 0 ? { key: "a" } : { not: deep(levels - 1) });
check(`default maxDepth is ${DEFAULT_MAX_FILTER_DEPTH}`, DEFAULT_MAX_FILTER_DEPTH === 5);
check("5 node levels pass at the default depth", validateFilter(deep(4)).length === 0);
check("6 node levels are rejected", validateFilter(deep(5))[0]?.key === "querykit.filter.max_depth");
check("max_depth reports the limit", validateFilter(deep(5))[0]?.args.max === 5);
check("maxDepth: 2 rejects 3 levels", validateFilter(deep(2), { maxDepth: 2 })[0]?.key === "querykit.filter.max_depth");
check("maxDepth: 2 accepts 2 levels", validateFilter(deep(1), { maxDepth: 2 }).length === 0);

/* ===================== 4. strictValue (opt-in, D3) ======================= */

check(
  "strict: `in` requires an array",
  validateFilter({ key: "a", operation: "in", value: "x" }, { strictValue: true })[0]?.key === "querykit.filter.value_requires_array",
);
check(
  "strict: `between` requires two values",
  validateFilter({ key: "a", operation: "between", value: [1, 2, 3] }, { strictValue: true })[0]?.key === "querykit.filter.value_requires_tuple",
);
check("strict: `between` accepts a 2-tuple", validateFilter({ key: "a", operation: "between", value: [1, 2] }, { strictValue: true }).length === 0);
check(
  "strict: `isNull` must not carry a value",
  validateFilter({ key: "a", operation: "isNull", value: 1 }, { strictValue: true })[0]?.key === "querykit.filter.value_forbidden",
);
check("strict: `isNull` without a value passes", validateFilter({ key: "a", operation: "isNull" }, { strictValue: true }).length === 0);
check("default (zod parity) allows a scalar for `in`", validateFilter({ key: "a", operation: "in", value: "x" }).length === 0);

/* =============================== 5. sort ================================= */

check("sort array valid", validateSort([{ key: "a", direction: "desc" }]).length === 0);
check("sort without direction valid", validateSort([{ key: "a" }]).length === 0);
check("sort string rejected", validateSort("-createdAt")[0]?.key === "querykit.sort.not_array");
check("sort object (non-array) rejected", validateSort({ key: "a" })[0]?.key === "querykit.sort.not_array");
check("sort bad direction rejected", validateSort([{ key: "a", direction: "sideways" }])[0]?.key === "querykit.sort.invalid_direction");
check("sort missing key rejected", validateSort([{ direction: "asc" }])[0]?.key === "querykit.sort.missing_key");
check("sort allowedKeys rejects unknown", validateSort([{ key: "a" }], { allowedKeys: ["b"] })[0]?.key === "querykit.sort.unknown_key");
check("undefined sort is valid", validateSort(undefined).length === 0);

/* ============================ 6. messages / i18n ========================= */

const opIssue = validateFilter({ key: "a", operation: "NOPE" })[0];
check("issue carries path/key/message/args", Boolean(opIssue?.path && opIssue.key && opIssue.message && opIssue.args));
check("message is interpolated", opIssue?.message === "filter.operation: `NOPE` is not a supported filter operator", opIssue?.message);
check("no unreplaced placeholder remains", !/\{\w+\}/.test(opIssue?.message ?? "{x}"));
check("rootPath renames the reported path", validateFilter({ key: "a", operation: "NOPE" }, { rootPath: "where" })[0]?.path === "where.operation");

const catalogKeys = Object.keys(QUERYKIT_MESSAGES_EN).sort().join("|");
check("uz catalog covers every key", Object.keys(QUERYKIT_MESSAGES_UZ).sort().join("|") === catalogKeys);
check("ru catalog covers every key", Object.keys(QUERYKIT_MESSAGES_RU).sort().join("|") === catalogKeys);
check("locale map exposes en/uz/ru", Object.keys(QUERYKIT_LOCALES).join(",") === "en,uz,ru");
check(
  "uz formatting",
  formatMessage("querykit.filter.unknown_key", { path: "filter[0]", key: "zzz" }, QUERYKIT_MESSAGES_UZ) ===
    "filter[0]: `zzz` ruxsat etilgan filter kaliti emas",
);
check(
  "ru formatting",
  formatMessage("querykit.filter.max_depth", { path: "filter", max: 5 }, QUERYKIT_MESSAGES_RU) === "filter превышает максимальную глубину фильтра (5)",
);
check(
  "localizeIssue re-renders an issue",
  opIssue ? localizeIssue(opIssue, QUERYKIT_MESSAGES_UZ) === "filter.operation: `NOPE` qo'llab-quvvatlanadigan filter operatori emas" : false,
);

/* ======================= 7. DTO layer (decorators) ======================= */

const listPayload = {
  filter: [
    { key: "buyerName", operation: "%_%", value: "ali" },
    { key: "createdAt", operation: ">=", value: "2026-01-01" },
    { key: "createdAt", operation: "<=", value: "2026-02-01" },
  ],
  sort: [{ key: "createdAt", direction: "desc" }],
  page: 1,
  perPage: 15,
};
check("realistic list payload valid", run(OffsetParamsDto, listPayload).errors.length === 0);

const coerced = run(OffsetParamsDto, { page: "2", perPage: "20" });
check("page/perPage coerced from strings", coerced.instance.page === 2 && coerced.instance.perPage === 20);
check("page 'abc' rejected", run(OffsetParamsDto, { page: "abc" }).errors.length === 1);
check("perPage 201 rejected (core cap 200)", Object.keys(run(OffsetParamsDto, { perPage: 201 }).errors[0]?.constraints ?? {}).includes("max"));
check("perPage 200 accepted", run(OffsetParamsDto, { perPage: 200 }).errors.length === 0);
check("perPage 0 rejected", run(OffsetParamsDto, { perPage: 0 }).errors.length === 1);
check("page has no ceiling", run(OffsetParamsDto, { page: 999_999 }).errors.length === 0);

check("infinite offset 0 accepted", run(InfiniteParamsDto, { offset: 0 }).errors.length === 0);
check("infinite offset -1 rejected", run(InfiniteParamsDto, { offset: -1 }).errors.length === 1);
check("infinite limit 201 rejected", run(InfiniteParamsDto, { limit: 201 }).errors.length === 1);

check("cursor params valid", run(CursorParamsDto, { limit: 20, cursor: null, cursorKey: "id", order: "asc", direction: "forward" }).errors.length === 0);
check("cursor rejects bad direction", run(CursorParamsDto, { direction: "sideways" }).errors.length === 1);
check("cursor rejects bad order", run(CursorParamsDto, { order: "upwards" }).errors.length === 1);
check("cursor has no sort field", !("sort" in run(CursorParamsDto, { sort: [{ key: "a" }] }, { whitelist: true }).instance));

check("base DTO validates sort", run(BaseParamsDto, { sort: "-createdAt" }).errors.length === 1);
check("base DTO accepts a valid sort", run(BaseParamsDto, { sort: [{ key: "a", direction: "asc" }] }).errors.length === 0);

const decoratorError = run(OffsetParamsDto, { filter: [{ key: "a", operation: "NOPE" }] });
check("decorator reports isQueryFilter", Object.keys(decoratorError.errors[0]?.constraints ?? {}).join() === "isQueryFilter");
check("decorator message names the operator", messageOf(decoratorError.errors).includes("NOPE"));
check("decorator path starts at the property name", messageOf(decoratorError.errors).startsWith("filter[0].operation"));
check("nested tree passes through the decorator", run(OffsetParamsDto, { filter: { and: [{ key: "a" }, { or: [{ key: "b" }] }] } }).errors.length === 0);
check("omitted filter/sort pass (optional)", run(OffsetParamsDto, {}).errors.length === 0);

/* ========================= 8. whitelist / server-owned =================== */

const wl = run(OffsetParamsDto, { columns: { password: true }, with: { secrets: true }, withDeleted: true, page: 1 }, { whitelist: true });
check("whitelist: payload still validates", wl.errors.length === 0);
check("whitelist strips `columns`", !("columns" in wl.instance));
check("whitelist strips `with`", !("with" in wl.instance));
check("whitelist strips `withDeleted`", !("withDeleted" in wl.instance));
check("whitelist keeps legitimate fields", wl.instance.page === 1);

/* =============================== 9. factories =========================== */

const Allowed = makeOffsetParamsDto({ allowedKeys: ["a"] });
check("factory: unknown filter key rejected", run(Allowed, { filter: [{ key: "b" }] }).errors.length === 1);
check("factory: message names the key", messageOf(run(Allowed, { filter: [{ key: "b" }] }).errors).includes("`b`"));
check("factory: allowed key accepted", run(Allowed, { filter: [{ key: "a" }] }).errors.length === 0);
check("factory: allowedKeys shorthand covers sort", run(Allowed, { sort: [{ key: "b" }] }).errors.length === 1);
check("factory: class keeps a readable name", Allowed.name === "OffsetParamsDto");

const Split = makeOffsetParamsDto({ allowedKeys: ["a"], sort: { allowedKeys: ["s"] } });
check(
  "factory: explicit sort.allowedKeys wins over the shorthand",
  run(Split, { sort: [{ key: "s" }] }).errors.length === 0 && run(Split, { sort: [{ key: "a" }] }).errors.length === 1,
);

const Open = makeOffsetParamsDto();
check("factory: instances are isolated from each other", run(Open, { filter: [{ key: "zzz" }] }).errors.length === 0);
check("factory: static DTOs are never polluted", run(OffsetParamsDto, { filter: [{ key: "zzz" }] }).errors.length === 0);

const Capped = makeOffsetParamsDto({ maxPerPage: 50 });
check("factory: maxPerPage 50 rejects 51", run(Capped, { perPage: 51 }).errors.length === 1);
check("factory: maxPerPage 50 accepts 50", run(Capped, { perPage: 50 }).errors.length === 0);
check("factory: maxPerPage Infinity disables the cap", run(makeOffsetParamsDto({ maxPerPage: Infinity }), { perPage: 1_000_000 }).errors.length === 0);
check("factory: infinite limit capped at 200", run(makeInfiniteParamsDto(), { limit: 100_000 }).errors.length === 1);
check("factory: cursor maxLimit honored", run(makeCursorParamsDto({ maxLimit: 10 }), { limit: 10 }).errors.length === 0);
check("factory: cursor limit 11 rejected at maxLimit 10", run(makeCursorParamsDto({ maxLimit: 10 }), { limit: 11 }).errors.length === 1);
check("factory: cursor drops sort", !("sort" in run(makeCursorParamsDto(), { sort: [{ key: "a" }] }, { whitelist: true }).instance));

const Admin = makeOffsetParamsDto({ allow: ["withDeleted"] });
const admin = run(Admin, { withDeleted: true, columns: { password: true } }, { whitelist: true });
check("factory: allow:[withDeleted] keeps it", admin.instance.withDeleted === true);
check("factory: allow:[withDeleted] still strips columns", !("columns" in admin.instance));
check("factory: allow:[withDeleted] type-checks the value", run(Admin, { withDeleted: "yes" }).errors.length === 1);

const Projection = makeOffsetParamsDto({ allow: ["columns", "with"] });
const projection = run(Projection, { columns: { name: true }, with: { author: true }, withDeleted: true }, { whitelist: true });
check("factory: allow:[columns,with] keeps both", Boolean(projection.instance.columns) && Boolean(projection.instance.with));
check("factory: allow:[columns,with] still strips withDeleted", !("withDeleted" in projection.instance));

check(
  "factory: strictValue opt-in reaches the decorator",
  run(makeOffsetParamsDto({ filter: { strictValue: true } }), { filter: [{ key: "a", operation: "in", value: "x" }] }).errors.length === 1,
);
check(
  "factory: messageStyle 'key' returns the i18n key",
  messageOf(run(makeOffsetParamsDto({ filter: { messageStyle: "key" } }), { filter: [{ key: "a", operation: "NOPE" }] }).errors) ===
    "querykit.filter.invalid_operator",
);
check("factory: maxDepth reaches the decorator", run(makeOffsetParamsDto({ filter: { maxDepth: 2 } }), { filter: deep(2) }).errors.length === 1);
check(
  "factory: allowedOperators narrows the set",
  run(makeOffsetParamsDto({ filter: { allowedOperators: ["="] } }), { filter: [{ key: "a", operation: "like", value: "x" }] }).errors.length === 1,
);

/* ==================== 10. built artifact (tree-shaking) ================== */
/* `sideEffects: false` bilan bundler dekorator ro'yxatga olishini tashlab
 * ketmasligini tekshiradi. `dist` yo'q bo'lsa (build qilinmagan) — skip. */
const distUrl = new URL("../dist/index.js", import.meta.url);
if (existsSync(fileURLToPath(distUrl))) {
  const dist = (await import(distUrl.href)) as typeof import("../src/index");
  const DistDto = dist.makeOffsetParamsDto({ allowedKeys: ["a"] });
  check("dist build: unknown key rejected", run(DistDto, { filter: [{ key: "b" }] }).errors.length === 1);
  check("dist build: allowed key accepted", run(DistDto, { filter: [{ key: "a" }] }).errors.length === 0);
  check("dist build: perPage cap survives bundling", run(dist.OffsetParamsDto, { perPage: 201 }).errors.length === 1);
} else {
  console.log("⏭️  dist/ not built — skipping the built-artifact checks (run `bun run build` to include them)");
}

console.log(`\n${failed === 0 ? "🎉 ALL PASSED" : "⚠️  SOME FAILED"} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
