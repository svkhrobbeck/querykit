---
name: querykit-core
description: Use when code creates or reads querykit filters, sort, pagination params or response meta, writes a querykit adapter or validator, or handles QueryKitError. @querykitjs/core is the single source of the request contract shared by every querykit package (backend adapters, zod and class-validator, the web client) - filter helpers (createFilters, f), operators, wire param and meta types, pagination defaults and caps, request limits, skip diagnostics.
---

## Safety rules

- DO cap page sizes with `DEFAULT_MAX_PER_PAGE` / `DEFAULT_MAX_LIMIT` (both `200`) imported from `@querykitjs/core`. Uncapped pagination is a DoS surface.
- DON'T write your own page-size cap (`100`, `500`, …) next to querykit code; the validators, the repositories and the web client all read the core constants.
- DO keep the request limits (`DEFAULT_QUERY_LIMITS`: filter depth `5`, conditions `30`, array items `200`, string length `256`, offset `10 000`, sort fields `3`). Raise one per schema or DTO with `limits` (`resolveLimits` fills the rest), never by turning a limit off; deeper pages than `maxOffset` go through cursor pagination.
- DON'T redeclare `FieldCondition`, `Filter`, `Sort`, `Wire*Params` or `*Meta` in an app or an adapter; import them from `@querykitjs/core` so both ends of the wire share one type.
- DO send dates over the wire as ISO strings. `Date` is accepted only in-memory (`FilterScalar`); adapters cast the string from the column type.
- DON'T forward client `columns`, `with` or `withDeleted` (fields of `WireBaseParams`) to a repository unchecked; projection belongs to the server (`forcedColumns` / `allowedColumns` on the backend adapters).
- DO make dropped conditions visible: a backend adapter skips an unknown key or an invalid value silently unless you pass `onSkippedCondition` (receives a `SkippedCondition`) or `strict: true` (throws `QueryKitError`).
- DON'T treat `forbidden-key` / `forbidden-operator` / `limit-exceeded` as skippable: they mean the server policy refused the request, and adapters throw them even without `strict`.
- DO wrap a driver-native filter object in `raw()` (from `@querykitjs/core`) when server code needs one; an unbranded object is refused as `forbidden-key`. DON'T build a `raw()` node from request data — the `filterable` policy does not look inside it.
- DO map `QueryKitError` to HTTP 400; check `err instanceof QueryKitError`, or `err.code === "QUERYKIT_INVALID_CONDITION"` across RPC/worker boundaries. DON'T match on the message text.

## When to use

- Building a typed filter tree on the server or in tests (`createFilters`, `f`).
- Typing a request body or response meta shared between backend and frontend.
- Writing a new adapter or validator that must follow the querykit contract.
- Reading the list of supported operators (`FILTER_OPERATORS`, `TEXT_FILTER_OPERATORS`).

Backend adapters (`@querykitjs/drizzle-pg`, `@querykitjs/prisma-pg`, `@querykitjs/mongoose`), validators (`@querykitjs/zod`, `@querykitjs/class-validator`) and `@querykitjs/web` re-use these types; reach for their own skills for repository, validation or client code.

## Setup

```bash
npm install @querykitjs/core
```

```ts
import { createFilters, DEFAULT_MAX_PER_PAGE, QueryKitError, type Filter } from "@querykitjs/core";

const uf = createFilters<"status">();
const filter: Filter<"status"> = uf.eq("status", "active");
export { filter, DEFAULT_MAX_PER_PAGE, QueryKitError };
```

## Common tasks

### Build a typed filter

`createFilters<TKey>()` binds the helpers to your keys; `f` is the same set without key typing. A flat array is an implicit AND; `range` returns two conditions (`>=` and `<=`) to spread into it.

```ts
import { createFilters, type Filter } from "@querykitjs/core";

type UserKey = "status" | "age" | "name" | "createdAt";
const uf = createFilters<UserKey>();

export const tree: Filter<UserKey> = uf.and(uf.eq("status", "active"), uf.gte("age", 18), uf.or(uf.contains("name", "ali"), uf.isNull("name")));

export const flat: Filter<UserKey> = [uf.in("status", ["active", "invited"]), ...uf.range("createdAt", "2026-01-01", "2026-12-31")];
```

### Cap a page size

```ts
import { DEFAULT_MAX_PER_PAGE, DEFAULT_PER_PAGE } from "@querykitjs/core";

export function perPageFrom(raw: unknown): number {
  const requested = typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_PER_PAGE;
  return Math.min(requested, DEFAULT_MAX_PER_PAGE);
}
```

### Raise one request limit

```ts
import { DEFAULT_QUERY_LIMITS, resolveLimits, type QueryLimits } from "@querykitjs/core";

// An import endpoint that filters by up to 500 ids; every other limit keeps its default.
export const importLimits: QueryLimits = resolveLimits({ maxInItems: 500 });

export const isDefaultDepth = importLimits.maxDepth === DEFAULT_QUERY_LIMITS.maxDepth;
```

### Type a request and its response meta

```ts
import type { FilterOperator, OffsetMeta, WireOffsetParams } from "@querykitjs/core";

const since: FilterOperator = ">=";

export const request: WireOffsetParams = {
  filter: [
    { key: "status", value: "active" },
    { key: "createdAt", operation: since, value: "2026-01-01T00:00:00.000Z" },
  ],
  sort: [{ key: "createdAt", direction: "desc" }],
  page: 1,
  perPage: 20,
};

export function hasMore(meta: OffsetMeta): boolean {
  return meta.has_next;
}
```

### Handle dropped conditions and `QueryKitError`

```ts
import { QueryKitError, type SkippedCondition } from "@querykitjs/core";

export function logSkipped(info: SkippedCondition): void {
  console.warn(`querykit skipped ${info.site} "${info.key}" on ${info.source}: ${info.reason}`);
}

export function toHttpError(err: unknown): { status: 400; error: string; key: string } | null {
  if (err instanceof QueryKitError) return { status: 400, error: err.message, key: err.info.key };
  return null;
}
```

### Check an operator coming from outside

```ts
import { FILTER_OPERATORS, TEXT_FILTER_OPERATORS, type FilterOperator } from "@querykitjs/core";

export function isFilterOperator(value: string): value is FilterOperator {
  return (FILTER_OPERATORS as readonly string[]).includes(value);
}

export function isTextOperator(operation: FilterOperator): boolean {
  return (TEXT_FILTER_OPERATORS as readonly string[]).includes(operation);
}
```

## Request contract

The same JSON shape travels from `@querykitjs/web` through a validator to a backend repository.

| Part          | Shape                                                                                        | Core type                                  |
| ------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------ |
| condition     | `{ key, operation?, value? }` — `operation` defaults to `"="`                                | `FieldCondition`                           |
| groups        | `{ and: [...] }`, `{ or: [...] }`, `{ not: node }`; a flat array = AND                       | `FilterNode`, `Filter`                     |
| sort          | always an array: `[{ key, direction? }]`, `direction` `"asc"` / `"desc"`                     | `Sort`, `SortItem`                         |
| offset page   | `page`, `perPage` (default `20`, cap `200`)                                                  | `WireOffsetParams`                         |
| infinite      | `limit` (default `20`, cap `200`), `offset`                                                  | `WireInfiniteParams`                       |
| cursor        | `limit`, `cursor`, `cursorKey`, `order`, `direction` (`"forward"` / `"backward"`); no `sort` | `WireCursorParams`                         |
| response meta | snake_case: `total_items`, `per_page`, `has_next`, `next_cursor`, …                          | `OffsetMeta`, `InfiniteMeta`, `CursorMeta` |

Operators: comparison `=` `!=` `>` `>=` `<` `<=` (aliases `eq` `ne` `gt` `gte` `lt` `lte`); text `like` `ilike` `notLike` `contains` `startsWith` `endsWith` (tokens `%_%` = contains, `%_` = startsWith, `_%` = endsWith); sets `in` `notIn`; ranges `between` `notBetween` (value `[min, max]`); `isNull` `isNotNull` (no value).

Request limits (`QueryLimits`, defaults in `DEFAULT_QUERY_LIMITS`): `maxDepth` `5` (root-to-leaf nodes; the root and the condition each count one level), `maxConditions` `30` (field conditions across all groups), `maxInItems` `200` (items in one array value), `maxStringLength` `256` (characters in one string value, also inside an array), `maxOffset` `10000` (`(page - 1) × perPage`, or infinite `offset`), `maxSortFields` `3`. A validator error names the limit and its value, e.g. `maxInItems (200)`.

Skip diagnostics: `SkippedCondition` = `{ source, site, key, operation?, reason }`, `site` one of `filter` `sort` `cursorKey` `aggregate` `page`, `reason` one of `unknown-key` `invalid-value` (dropped, or thrown under `strict`) and `forbidden-key` `forbidden-operator` `limit-exceeded` (server policy: always thrown as `QueryKitError`, never dropped). `Filterable` = field → allowed operators or `"*"`.

## Mistakes to avoid

- Sending `sort` as an object (`{ createdAt: "desc" }`) — it is always an array of `{ key, direction }`.
- Putting a `Date` in a JSON body — send the ISO string; `@querykitjs/zod` validates wire scalars without `Date`.
- Sending `between` as two values or two conditions — on the wire its `value` is one array `[min, max]`.
- Adding `sort` to cursor params — `WireCursorParams` has no `sort`; ordering comes from `order` and `direction`.
- Using `f` where the keys are known — `createFilters<TKey>()` catches a mistyped key at compile time.
- Treating an empty result as "no match" while a filter key is misspelled — wire `onSkippedCondition` or `strict` first.
