/**
 * Bulk mutations and `withTotal` (task 013). `updateWhere` / `deleteWhere` are one
 * atomic write (`calls: ["write"]`, no read before it), return `{ count }` or, with
 * `returning: { limit }`, `{ count, rows }`; an empty filter is refused unless the
 * caller says `{ all: true }`. `findList({ withTotal: false })` reads `perPage + 1`
 * rows and runs no count.
 */
import { ALL, byCreated, type ConformanceCase } from "./case-types";

/** Red until 013 phase 3 (mutations) and phase 4 (withTotal) land; removed there. */
const MUT = { "drizzle-pg": "013 p3", "prisma-pg": "013 p3", mongoose: "013 p3" } as const;
const TOTAL = { "drizzle-pg": "013 p4", "prisma-pg": "013 p4", mongoose: "013 p4" } as const;
const WEB = "a mutation is a repository call, not built by web";
const AGE_17_UP = [{ key: "age", operation: ">=", value: 17 }];
const UNDER_17_OR_NULL = ["Carol", "Alina"];
const emptyFilter = (method: "updateWhere" | "deleteWhere") => ({ site: "mutation", key: method, reason: "empty-filter" }) as const;

export const MUTATION_CASES: readonly ConformanceCase[] = [
  {
    name: "A1/A2: updateWhere → { count }, one write and no read before it",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "updateWhere", params: { filter: AGE_17_UP, patch: { age: 99 } } },
    expect: { meta: { count: 5 }, returned: 0, remaining: ALL, calls: ["write"] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A2: updateWhere writes the patch",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "updateWhere", params: { filter: [{ key: "name", operation: "=", value: "Bob" }], patch: { name: "Bobby" } } },
    expect: { meta: { count: 1 }, remaining: ["Alice", "Bobby", "Carol", "dave", "Eve_Ann", "Frank", "Alina"], calls: ["write"] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A2: updateWhere returning { limit: 2 } with 5 matches → count 5, 2 rows",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "updateWhere", params: { filter: AGE_17_UP, patch: { age: 99 }, options: { returning: { limit: 2 } } } },
    expect: { meta: { count: 5 }, returned: 2 },
    notBuiltByWeb: WEB,
  },
  {
    name: "A2: deleteWhere → { count }, one write",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "deleteWhere", params: { filter: AGE_17_UP } },
    expect: { meta: { count: 5 }, returned: 0, remaining: UNDER_17_OR_NULL, calls: ["write"] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A2: deleteWhere returning { limit: 2 } with 5 matches → count 5, 2 rows",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "deleteWhere", params: { filter: AGE_17_UP, options: { returning: { limit: 2 } } } },
    expect: { meta: { count: 5 }, returned: 2, remaining: UNDER_17_OR_NULL },
    notBuiltByWeb: WEB,
  },
  ...[
    ["{}", {}],
    ["[]", []],
    ["undefined", undefined],
  ].map(([label, filter]): ConformanceCase => ({
    name: `A3: deleteWhere(${String(label)}) → empty-filter, the driver is not called`,
    group: "mutation",
    knownDifference: MUT,
    call: { method: "deleteWhere", params: { filter } },
    expect: { error: emptyFilter("deleteWhere"), remaining: ALL, calls: [] },
    notBuiltByWeb: WEB,
  })),
  {
    name: "A3: updateWhere(undefined) → empty-filter, the driver is not called",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "updateWhere", params: { filter: undefined, patch: { age: 1 } } },
    expect: { error: emptyFilter("updateWhere"), remaining: ALL, calls: [] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A4: deleteWhere with only an unknown key (skipped) → empty-filter, not the whole table",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "deleteWhere", params: { filter: [{ key: "nope", operation: "=", value: 1 }] } },
    expect: { error: emptyFilter("deleteWhere"), remaining: ALL, calls: [] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A3a: deleteWhere by a field outside filterable → forbidden-key, the driver is not called",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "deleteWhere", params: { filter: [{ key: "email", operation: "startsWith", value: "a" }] } },
    options: { policy: { filterable: { name: ["="] } } },
    expect: { error: { site: "filter", key: "email", reason: "forbidden-key" }, remaining: ALL, calls: [] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A3a: updateWhere by a field outside filterable → forbidden-key, the driver is not called",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "updateWhere", params: { filter: [{ key: "email", operation: "startsWith", value: "a" }], patch: { age: 1 } } },
    options: { policy: { filterable: { name: ["="] } } },
    expect: { error: { site: "filter", key: "email", reason: "forbidden-key" }, remaining: ALL, calls: [] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A3a: a mutation filter past maxLikeWildcards → limit-exceeded",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "deleteWhere", params: { filter: [{ key: "name", operation: "like", value: "%a%l%e" }] } },
    options: { policy: { filterable: { name: "*" } } },
    expect: { error: { site: "filter", key: "maxLikeWildcards", reason: "limit-exceeded" }, remaining: ALL, calls: [] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A5: deleteWhere({ all: true }) deletes every row",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "deleteWhere", params: { filter: { all: true } } },
    expect: { meta: { count: 7 }, remaining: [], calls: ["write"] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A5: deleteWhere({ all: true }) on a scoped repository deletes only the scope's rows",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "deleteWhere", params: { filter: { all: true } } },
    options: { scope: { age: 25 } },
    expect: { meta: { count: 2 }, remaining: ["Alice", "Carol", "dave", "Frank", "Alina"], calls: ["write"] },
    notBuiltByWeb: WEB,
  },
  {
    name: "A5: a scoped updateWhere does not reach rows outside the scope",
    group: "mutation",
    knownDifference: MUT,
    call: { method: "updateWhere", params: { filter: [{ key: "name", operation: "=", value: "Alice" }], patch: { name: "Zed" } } },
    options: { scope: { age: 25 } },
    expect: { meta: { count: 0 }, remaining: ALL },
    notBuiltByWeb: WEB,
  },
  {
    name: "A6: findList withTotal: false → no count, perPage + 1 rows read, totals null",
    group: "pagination",
    call: { method: "findList", params: { sort: byCreated, page: 1, perPage: 3, withTotal: false } },
    expect: {
      names: ["Alice", "Bob", "Carol"],
      ordered: true,
      meta: { total_items: null, total_pages: null, current_page: 1, per_page: 3, has_next: true, has_prev: false },
      calls: ["find:4"],
    },
    notBuiltByWeb: "withTotal is a server-side option (web meta follows in 015)",
    knownDifference: TOTAL,
  },
  {
    name: "A6: withTotal: false on the last page → has_next false",
    group: "pagination",
    call: { method: "findList", params: { sort: byCreated, page: 3, perPage: 3, withTotal: false } },
    expect: {
      names: ["Alina"],
      meta: { total_items: null, total_pages: null, current_page: 3, per_page: 3, has_next: false, has_prev: true },
      calls: ["find:4"],
    },
    notBuiltByWeb: "withTotal is a server-side option (web meta follows in 015)",
    knownDifference: TOTAL,
  },
  {
    name: "A6: withTotal: false with exactly perPage rows → has_next false",
    group: "pagination",
    call: { method: "findList", params: { sort: byCreated, page: 1, perPage: 7, withTotal: false } },
    expect: { names: ALL, meta: { total_items: null, total_pages: null, current_page: 1, per_page: 7, has_next: false, has_prev: false } },
    notBuiltByWeb: "withTotal is a server-side option (web meta follows in 015)",
    knownDifference: TOTAL,
  },
  {
    name: "A7: findList without withTotal counts as before",
    group: "pagination",
    call: { method: "findList", params: { sort: byCreated, page: 1, perPage: 3 } },
    expect: {
      names: ["Alice", "Bob", "Carol"],
      ordered: true,
      meta: { total_items: 7, total_pages: 3, current_page: 1, per_page: 3, has_next: true, has_prev: false },
      calls: ["find:3", "count"],
    },
  },
];
