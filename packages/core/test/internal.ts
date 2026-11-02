/**
 * `@querykitjs/core/internal` — the pieces every adapter shares.
 *
 *   bun run test/internal.ts
 */
import { DEFAULT_QUERY_LIMITS, QueryKitError, raw, resolveLimits, type SkippedCondition } from "../src/index";
import {
  clampOffset,
  clampPage,
  clampPageSize,
  createContextStore,
  cursorPage,
  decodeCursor,
  encodeCursor,
  encodeCursorToken,
  findFilterLimitViolation,
  formatLimit,
  infinitePage,
  isRaw,
  likeWildcards,
  normalizeSort,
  offsetMeta,
  offsetOf,
  reportSkip,
  resolvePolicy,
  type PolicyOptions,
} from "../src/internal/index";
import { HOSTILE_DEPTH, LIMIT_CASES, notChain } from "./conformance/cases-limits";
import { runLimitCases } from "./conformance/limits-runner";
import "./dist";
import "./cursor";
import "./mutation";

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, extra = "") {
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (ok) passed++;
  else failed++;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/* cursor */
const date = new Date("2026-03-20T09:00:00.000Z");
check("cursor token is base64url of {v}", encodeCursor(5) === Buffer.from('{"v":5}').toString("base64url"));
check("a date cursor round-trips as an ISO string", decodeCursor(encodeCursor(date)) === date.toISOString());
check("an undecodable cursor is undefined", decodeCursor("%%%") === undefined && decodeCursor(null) === undefined);

/* diagnostics */
const seen: SkippedCondition[] = [];
reportSkip({ source: "users", strict: false, onSkipped: info => seen.push(info) }, { site: "filter", key: "nope", reason: "unknown-key" });
check("non-strict reports through the hook with the source", same(seen, [{ site: "filter", key: "nope", reason: "unknown-key", source: "users" }]));
let thrown: unknown;
try {
  reportSkip({ source: "users", strict: true }, { site: "sort", key: "nope", reason: "unknown-key" });
} catch (err) {
  thrown = err;
}
check("strict throws QueryKitError", thrown instanceof QueryKitError && thrown.info.site === "sort");

/* context */
const store = createContextStore<{ executor?: string }>();
const inside = store.run({ executor: "tx" }, () => store.get()?.executor);
check("context is visible inside run and gone outside", inside === "tx" && store.get() === undefined);

/* sort */
check(
  "normalizeSort defaults direction and drops keyless items",
  same(normalizeSort([{ key: "a" }, null as never, { key: "" } as never, { key: "b", direction: "desc" }]), [
    { key: "a", direction: "asc" },
    { key: "b", direction: "desc" },
  ]),
);

/* pagination */
check(
  "clampPageSize: default, truncate, min 1, max",
  clampPageSize(undefined, 20, 200) === 20 && clampPageSize(2.9, 20, 200) === 2 && clampPageSize(0, 20, 200) === 1 && clampPageSize(500, 20, 200) === 200,
);
check("clampPage / clampOffset", clampPage(undefined) === 1 && clampPage(-3) === 1 && clampOffset(undefined) === 0 && clampOffset(4.7) === 4);
check("offsetMeta", same(offsetMeta(2, 3, 7), { total_items: 7, total_pages: 3, current_page: 2, per_page: 3, has_next: true, has_prev: true }));
const infinite = infinitePage([1, 2, 3], 2, 4);
check("infinitePage drops the probe row", same(infinite, { data: [1, 2], meta: { limit: 2, offset: 4, count: 2, has_more: true, next_offset: 6 } }));
const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
const forward = await cursorPage(rows, { limit: 2, direction: "forward", hasCursor: false, cursorField: "id", idField: "id" });
check(
  "cursorPage forward (v2 tokens carry k and id)",
  same(forward.data, [{ id: 1 }, { id: 2 }]) &&
    same(forward.meta, { limit: 2, has_next: true, has_prev: false, next_cursor: await encodeCursorToken({ k: 2, id: 2 }), prev_cursor: null }),
);
const backward = await cursorPage([{ id: 5 }, { id: 4 }, { id: 3 }], { limit: 2, direction: "backward", hasCursor: true, cursorField: "id", idField: "id" });
check(
  "cursorPage backward flips to display order",
  same(backward.data, [{ id: 4 }, { id: 5 }]) &&
    backward.meta.has_prev &&
    backward.meta.has_next &&
    backward.meta.prev_cursor === (await encodeCursorToken({ k: 4, id: 4 })),
);

/* request limits (task 008) — the walk judges the filter cases of the shared limit table */
const filterLimitResult = runLimitCases(
  "core walk",
  testCase => findFilterLimitViolation(testCase.params.filter, resolveLimits(testCase.limits)) === undefined,
  { cases: LIMIT_CASES.filter(testCase => testCase.kind === "filter") },
);
passed += filterLimitResult.passed;
failed += filterLimitResult.failed;

const inViolation = findFilterLimitViolation(
  { and: [{ key: "a" }, { or: [{ key: "id", operation: "in", value: Array.from({ length: 201 }, (_, i) => i) }] }] },
  DEFAULT_QUERY_LIMITS,
);
check("violation names limit, max and path", same(inViolation, { limit: "maxInItems", max: 200, path: ["and", 1, "or", 0, "value"] }));
check(
  "string inside an array: path ends at the item index",
  same(findFilterLimitViolation([{ key: "n", value: ["a", "b".repeat(257)] }], DEFAULT_QUERY_LIMITS)?.path, [0, "value", 1]),
);
check(
  "depth violation path follows the not chain",
  same(findFilterLimitViolation(notChain(6), DEFAULT_QUERY_LIMITS)?.path, ["not", "not", "not", "not", "not"]),
);
check("malformed nodes are left to the validator", findFilterLimitViolation([null, 3, { and: "x" }, { foo: 1 }], DEFAULT_QUERY_LIMITS) === undefined);
check("undefined filter has no violation", findFilterLimitViolation(undefined, DEFAULT_QUERY_LIMITS) === undefined);

const hostileStarted = performance.now();
const hostile = findFilterLimitViolation(notChain(HOSTILE_DEPTH), DEFAULT_QUERY_LIMITS);
const hostileMs = performance.now() - hostileStarted;
check(`hostile depth ${HOSTILE_DEPTH} stops at maxDepth`, hostile?.limit === "maxDepth" && hostile.path.length === 5);
check(`hostile depth ${HOSTILE_DEPTH} < 50 ms`, hostileMs < 50, `${hostileMs.toFixed(2)} ms`);

check(
  "offsetOf: (page - 1) × perPage, default perPage 20",
  offsetOf(501, 20) === 10_000 && offsetOf(502, undefined) === 10_020 && offsetOf(undefined, 50) === 0,
);
check("formatLimit", formatLimit("maxInItems", 200) === "maxInItems (200)");

/* request policy (task 009) */
const FIELDS = new Map([
  ["id", "id"],
  ["status", "status"],
  ["secret", "secret"],
  ["createdAt", "createdAt"],
  ["created_at", "createdAt"],
]);
const policyOf = (options: Partial<PolicyOptions> = {}) =>
  resolvePolicy({ source: "accounts", fieldOf: key => FIELDS.get(key), primaryKey: "id", createdAt: "createdAt", ...options });
const refusal = (run: () => void): string => {
  try {
    run();
    return "ok";
  } catch (error) {
    return error instanceof QueryKitError ? `${error.info.reason}/${error.info.site}/${error.info.key}` : `threw ${String(error)}`;
  }
};
const statusPolicy = policyOf({ filterable: { status: ["=", "in"] } });
check(
  "policy: forbidden field",
  refusal(() => statusPolicy.checkFilter([{ key: "secret", operation: "startsWith", value: "a" }])) === "forbidden-key/filter/secret",
);
check(
  "policy: forbidden operator",
  refusal(() => statusPolicy.checkFilter([{ key: "status", operation: "like", value: "%" }])) === "forbidden-operator/filter/status",
);
check(
  "policy: nested or/not is walked",
  refusal(() => statusPolicy.checkFilter({ or: [{ key: "status" }, { not: { key: "secret" } }] })) === "forbidden-key/filter/secret",
);
check("policy: unknown key is left to the adapter", refusal(() => statusPolicy.checkFilter([{ key: "nope", operation: "like" }])) === "ok");
check(
  'policy: alias eq passes a ["="] rule',
  refusal(() => policyOf({ filterable: { status: ["="] } }).checkFilter([{ key: "status", operation: "eq" }])) === "ok",
);
check(
  'policy: "*" admits every operator',
  refusal(() => policyOf({ filterable: { status: "*" } }).checkFilter([{ key: "status", operation: "notLike" }])) === "ok",
);
check(
  "policy: DB column name maps to the field",
  refusal(() => policyOf({ filterable: { createdAt: [">="] } }).checkFilter([{ key: "created_at", operation: ">=" }])) === "ok",
);
check("policy: non-object nodes are left to the validator", refusal(() => statusPolicy.checkFilter([null, 3] as never)) === "ok");
check(
  "policy R19: an unbranded driver object → forbidden-key (first key)",
  refusal(() => statusPolicy.checkFilter([{ secret: { startsWith: "a" } }] as never)) === "forbidden-key/filter/secret",
);
check(
  "policy R19: a raw() node is server code, not checked",
  refusal(() => statusPolicy.checkFilter([raw({ secret: { startsWith: "a" } })] as never)) === "ok",
);
check(
  "policy R19: isNative admits the adapter's own objects",
  refusal(() => policyOf({ filterable: { status: ["="] }, isNative: node => "queryChunks" in node }).checkFilter([{ queryChunks: [] }] as never)) === "ok",
);
check(
  "isRaw: brand is a Symbol, JSON drops it",
  isRaw(raw({ a: 1 })) && !isRaw(JSON.parse(JSON.stringify(raw({ a: 1 })))) && Object.keys(raw({ a: 1 })).length === 1,
);
check("policy: filter limit → limit-exceeded", refusal(() => statusPolicy.checkFilter(notChain(6))) === "limit-exceeded/filter/maxDepth");
check(
  "policy default: allowedColumns, equality only",
  refusal(() => policyOf({ allowedColumns: ["status"] }).checkFilter([{ key: "status", operation: "in" }])) === "ok" &&
    refusal(() => policyOf({ allowedColumns: ["status"] }).checkFilter([{ key: "status", operation: ">" }])) === "forbidden-operator/filter/status",
);
check(
  "policy default: forcedColumns keys",
  refusal(() => policyOf({ forcedColumns: { status: true, secret: false } }).checkFilter([{ key: "secret" }])) === "forbidden-key/filter/secret",
);
check(
  "policy default: primary key only",
  refusal(() => policyOf().checkFilter([{ key: "id" }])) === "ok" &&
    refusal(() => policyOf().checkFilter([{ key: "status" }])) === "forbidden-key/filter/status",
);
check(
  "policy sort: default sortable = id, createdAt",
  refusal(() => policyOf().checkSort([{ key: "createdAt" }, { key: "id" }])) === "ok" &&
    refusal(() => policyOf().checkSort([{ key: "secret" }])) === "forbidden-key/sort/secret",
);
check(
  "policy sort: field count → limit-exceeded",
  refusal(() => policyOf({ sortable: ["id", "status", "secret", "createdAt"] }).checkSort(["id", "status", "secret", "createdAt"].map(key => ({ key })))) ===
    "limit-exceeded/sort/maxSortFields",
);
check(
  "policy cursorKey",
  refusal(() => policyOf().checkCursorKey("secret")) === "forbidden-key/cursorKey/secret" && refusal(() => policyOf().checkCursorKey("id")) === "ok",
);
check(
  "policy page: 501 ok, 502 refused, offset 10 001 refused",
  refusal(() => policyOf().checkPage({ page: 501, perPage: 20 })) === "ok" &&
    refusal(() => policyOf().checkPage({ page: 502, perPage: 20 })) === "limit-exceeded/page/maxOffset" &&
    refusal(() => policyOf().checkPage({ offset: 10_001 })) === "limit-exceeded/page/maxOffset",
);
check(
  "policy page: limits override",
  refusal(() => policyOf({ limits: { maxOffset: 100 } }).checkPage({ page: 7, perPage: 20 })) === "limit-exceeded/page/maxOffset",
);
check(
  "policy aggregate key",
  refusal(() => statusPolicy.checkAggregateKey("secret")) === "forbidden-key/aggregate/secret" &&
    refusal(() => statusPolicy.checkAggregateKey("status")) === "ok",
);

/* LIKE wildcard limit (task 011) */
check(
  "likeWildcards: %% counts once, escapes skipped",
  likeWildcards("%%a%") === 2 && likeWildcards("%a%a%b") === 3 && likeWildcards("a\\%b_") === 1 && likeWildcards("abc") === 0,
);
check(
  "policy: like past maxLikeWildcards → limit-exceeded",
  refusal(() => policyOf({ filterable: { status: "*" } }).checkFilter([{ key: "status", operation: "like", value: "%a%a%b" }])) ===
    "limit-exceeded/filter/maxLikeWildcards",
);
check(
  "policy: contains is not a LIKE pattern (no wildcard count)",
  refusal(() => policyOf({ filterable: { status: "*" } }).checkFilter([{ key: "status", operation: "contains", value: "%a%a%b" }])) === "ok",
);

console.log(`\ncore/internal: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
