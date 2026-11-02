/** Query cases: sort, the three pagination modes, diagnostics, projection guard. */
import { ALL, BY_CREATED, byCreated, cursorToken, where, type ConformanceCase } from "./case-types";

export const SORT_CASES: ConformanceCase[] = [
  {
    name: "sort by one field",
    group: "sort",
    call: { method: "findAll", params: { sort: [{ key: "createdAt", direction: "desc" }] } },
    expect: { names: [...BY_CREATED].reverse(), ordered: true },
  },
  {
    name: "sort by two fields",
    group: "sort",
    call: {
      method: "findAll",
      params: {
        filter: [{ key: "age", operation: "isNotNull" }],
        sort: [
          { key: "age", direction: "desc" },
          { key: "name", direction: "asc" },
        ],
      },
    },
    expect: { names: ["dave", "Alice", "Bob", "Eve_Ann", "Frank"], ordered: true },
  },
  {
    name: "sort on a nullable field puts NULL first on asc (B11)",
    group: "sort",
    call: {
      method: "findAll",
      params: {
        sort: [
          { key: "age", direction: "asc" },
          { key: "createdAt", direction: "desc" },
        ],
      },
    },
    expect: { names: ["Alina", "Carol", "Frank", "Eve_Ann", "Bob", "Alice", "dave"], ordered: true },
  },
  {
    name: "unknown sort key is skipped and reported",
    group: "sort",
    call: { method: "findAll", params: { sort: [{ key: "nope", direction: "asc" }] } },
    expect: { names: ALL, skipped: [{ site: "sort", key: "nope", reason: "unknown-key" }] },
  },
  {
    name: "malformed sort items (null, no key) are skipped and reported (B14)",
    notBuiltByWeb: "the web builders drop sort items without a key",
    group: "sort",
    call: { method: "findAll", params: { sort: [null, {}, ...byCreated] as unknown as typeof byCreated } },
    expect: {
      names: BY_CREATED,
      ordered: true,
      skipped: [
        { site: "sort", key: "", reason: "invalid-value" },
        { site: "sort", key: "", reason: "invalid-value" },
      ],
    },
  },
  {
    name: "strict: a malformed sort item throws (B14)",
    notBuiltByWeb: "the web builders drop sort items without a key",
    group: "sort",
    call: { method: "findAll", params: { sort: [null, {}, ...byCreated] as unknown as typeof byCreated } },
    options: { strict: true },
    expect: { error: { site: "sort", key: "", reason: "invalid-value" } },
  },
];

export const PAGINATION_CASES: ConformanceCase[] = [
  {
    name: "offset page 2",
    group: "pagination",
    call: { method: "findList", params: { sort: byCreated, page: 2, perPage: 3 } },
    expect: {
      names: ["dave", "Eve_Ann", "Frank"],
      ordered: true,
      meta: { total_items: 7, total_pages: 3, current_page: 2, per_page: 3, has_next: true, has_prev: true },
    },
  },
  {
    name: "offset with a filter",
    group: "pagination",
    call: { method: "findList", params: { filter: [{ key: "age", operation: "isNotNull" }], sort: [{ key: "age", direction: "desc" }], page: 1, perPage: 2 } },
    expect: {
      names: ["dave", "Alice"],
      ordered: true,
      meta: { total_items: 5, total_pages: 3, current_page: 1, per_page: 2, has_next: true, has_prev: false },
    },
  },
  {
    name: "perPage above the cap is clamped to 200",
    group: "pagination",
    call: { method: "findList", params: { sort: byCreated, page: 1, perPage: 500 } },
    expect: {
      names: BY_CREATED,
      ordered: true,
      meta: { total_items: 7, total_pages: 1, current_page: 1, per_page: 200, has_next: false, has_prev: false },
    },
  },
  {
    name: "infinite with more rows",
    group: "pagination",
    call: { method: "findInfinite", params: { sort: byCreated, limit: 2, offset: 2 } },
    expect: { names: ["Carol", "dave"], ordered: true, meta: { limit: 2, offset: 2, count: 2, has_more: true, next_offset: 4 } },
  },
  {
    name: "infinite last page",
    group: "pagination",
    call: { method: "findInfinite", params: { sort: byCreated, limit: 5, offset: 5 } },
    expect: { names: ["Frank", "Alina"], ordered: true, meta: { limit: 5, offset: 5, count: 2, has_more: false, next_offset: null } },
  },
  {
    name: "cursor first page",
    group: "pagination",
    call: { method: "findCursor", params: { cursorKey: "createdAt", limit: 3, order: "asc" } },
    expect: {
      names: ["Alice", "Bob", "Carol"],
      ordered: true,
      meta: { limit: 3, has_next: true, has_prev: false, next_cursor: cursorToken("2026-03-20T09:00:00.000Z"), prev_cursor: null },
    },
  },
  {
    name: "cursor next page from the token",
    group: "pagination",
    call: { method: "findCursor", params: { cursorKey: "createdAt", limit: 3, order: "asc" }, followNext: true },
    expect: {
      names: ["dave", "Eve_Ann", "Frank"],
      ordered: true,
      meta: {
        limit: 3,
        has_next: true,
        has_prev: true,
        next_cursor: cursorToken("2026-06-30T09:00:00.000Z"),
        prev_cursor: cursorToken("2026-04-05T09:00:00.000Z"),
      },
    },
  },
  {
    name: "cursor descending",
    group: "pagination",
    call: { method: "findCursor", params: { cursorKey: "createdAt", limit: 4, order: "desc" } },
    expect: {
      names: ["Alina", "Frank", "Eve_Ann", "dave"],
      ordered: true,
      meta: { limit: 4, has_next: true, has_prev: false, next_cursor: cursorToken("2026-04-05T09:00:00.000Z"), prev_cursor: null },
    },
  },
];

export const DIAGNOSTIC_CASES: ConformanceCase[] = [
  {
    name: "unknown filter key is skipped and reported",
    group: "diagnostics",
    ...where([{ key: "nope", operation: "=", value: 1 }], ALL),
    expect: { names: ALL, skipped: [{ site: "filter", key: "nope", reason: "unknown-key" }] },
  },
  {
    name: "invalid value is skipped and reported",
    group: "diagnostics",
    ...where([{ key: "age", operation: "=", value: "abc" }], ALL),
    expect: { names: ALL, skipped: [{ site: "filter", key: "age", reason: "invalid-value" }] },
  },
  {
    name: "a skipped condition leaves the others in force",
    group: "diagnostics",
    ...where(
      [
        { key: "age", operation: ">=", value: 30 },
        { key: "nope", operation: "=", value: 1 },
      ],
      ["Alice", "dave"],
    ),
    expect: { names: ["Alice", "dave"], skipped: [{ site: "filter", key: "nope", reason: "unknown-key" }] },
  },
  {
    name: "strict: unknown filter key throws",
    group: "diagnostics",
    call: { method: "findAll", params: { filter: [{ key: "nope", operation: "=", value: 1 }] } },
    options: { strict: true },
    expect: { error: { site: "filter", key: "nope", reason: "unknown-key" } },
  },
  {
    name: "strict: invalid value throws",
    group: "diagnostics",
    call: { method: "findAll", params: { filter: [{ key: "age", operation: "=", value: "abc" }] } },
    options: { strict: true },
    expect: { error: { site: "filter", key: "age", reason: "invalid-value" } },
  },
  {
    name: "strict: unknown sort key throws",
    group: "diagnostics",
    call: { method: "findAll", params: { sort: [{ key: "nope", direction: "asc" }] } },
    options: { strict: true },
    expect: { error: { site: "sort", key: "nope", reason: "unknown-key" } },
  },
  {
    name: "unknown cursorKey always throws",
    group: "diagnostics",
    call: { method: "findCursor", params: { cursorKey: "nope", limit: 2 } },
    expect: { error: { site: "cursorKey", key: "nope", reason: "unknown-key" } },
  },
];

export const PROJECTION_CASES: ConformanceCase[] = [
  {
    name: "forcedColumns ignores the client selection",
    group: "projection",
    call: { method: "findAll", params: { columns: { email: true } } },
    options: { forcedColumns: { id: true, name: true } },
    expect: { names: ALL, keys: ["id", "name"] },
  },
  {
    name: "forcedColumns applies to offset pages",
    group: "projection",
    call: { method: "findList", params: { sort: byCreated, page: 1, perPage: 2 } },
    options: { forcedColumns: { id: true, name: true } },
    expect: {
      names: ["Alice", "Bob"],
      ordered: true,
      keys: ["id", "name"],
      meta: { total_items: 7, total_pages: 4, current_page: 1, per_page: 2, has_next: true, has_prev: false },
    },
  },
  {
    name: "allowedColumns intersects the client selection",
    group: "projection",
    call: { method: "findAll", params: { columns: { name: true, email: true } } },
    options: { allowedColumns: ["id", "name"] },
    expect: { names: ALL, keys: ["name"] },
  },
  {
    name: "allowedColumns with no overlap falls back to the allow-list",
    group: "projection",
    call: { method: "findAll", params: { columns: { email: true } } },
    options: { allowedColumns: ["id", "name"] },
    expect: { names: ALL, keys: ["id", "name"] },
  },
  {
    name: "cursor column is not leaked past allowedColumns",
    group: "projection",
    call: { method: "findCursor", params: { cursorKey: "createdAt", limit: 2, order: "asc", columns: { name: true } } },
    options: { allowedColumns: ["name"] },
    expect: {
      names: ["Alice", "Bob"],
      ordered: true,
      keys: ["name"],
      meta: { limit: 2, has_next: true, has_prev: false, next_cursor: cursorToken("2026-02-15T09:00:00.000Z"), prev_cursor: null },
    },
  },
];
