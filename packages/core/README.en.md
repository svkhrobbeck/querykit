<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykitjs/core

> Shared, **ORM-agnostic** query DSL for the querykit family: filter types, operators, the `createFilters` builder, and wire-meta shapes.

You usually **don't install this directly** — it's the shared foundation used by `@querykitjs/drizzle-pg` (backend) and `@querykitjs/web` (frontend). Types are generic over a key (`TKey`); each adapter specializes it to its own key type (a Drizzle table column or an entity field).

## What's inside

- **`FilterOperator`** — every operator: `= != > >= < <=` (+ `eq/ne/gt/gte/lt/lte`), `like/ilike/notLike`, `contains/startsWith/endsWith` (+ tokens `%_%`/`%_`/`_%`), `in/notIn`, `between/notBetween`, `isNull/isNotNull`.
- **Filter tree** — `FieldCondition<TKey>`, `AndGroup/OrGroup/NotGroup<TKey, TRaw>`, `FilterNode<TKey, TRaw>`, `Filter<TKey, TRaw>`. `TRaw` is an adapter-provided raw escape hatch (e.g. a Drizzle `SQL`; defaults to `never`).
- **`FilterScalar` / `FilterValue`**, **`SortDirection`**.
- **`createFilters<TKey, TRaw>()`** + **`f`** — ergonomic builder (eq/ne/…, contains/…, like/ilike/notLike, in/notIn, between, range, isNull/isNotNull, and/or/not).
- **Wire meta** (server response, snake_case) — `OffsetMeta`, `InfiniteMeta`, `CursorMeta`.
- **`Filterable`** and the skip / refusal reasons (`SkipReason`: `unknown-key`, `invalid-value`, `forbidden-key`, `forbidden-operator`, `limit-exceeded`; `SkipSite` + `page`) — policy reasons are never dropped silently, always a `QueryKitError`.
- **`raw(value)`** — the brand for a driver's own filter object (a Prisma `where`, a Mongo filter) (R19). An adapter accepts a raw node only when it is branded with `raw()`; an unbranded plain object (it can come from a JSON body) → `QueryKitError` `forbidden-key`. ⚠️ A raw node is server code — `filterable` does not look inside it; never build one from request data.
- **Request limits** — `QueryLimits`, `DEFAULT_QUERY_LIMITS`, `resolveLimits(partial)` and one constant per limit (table below).

- **`@querykitjs/core/internal`** — **adapter and validator authors only**: cursor tokens, skip diagnostics, the per-call repository context, sort normalization, pagination metas, the limit walk (`findFilterLimitViolation`) and the request policy (`resolvePolicy`: `filterable` / `sortable` / `limits`) shared by every querykit package. Not application API; it may change in a minor release.

## Limits

Every filter and pagination request is bounded in size at parse time. `@querykitjs/zod` and `@querykitjs/class-validator` reject a payload past any limit; `@querykitjs/web` does not build a payload past the offset or sort limit.

| Limit             | Constant                    | Default  | What counts                                                                       |
| ----------------- | --------------------------- | -------- | --------------------------------------------------------------------------------- |
| `maxDepth`        | `DEFAULT_MAX_FILTER_DEPTH`  | `5`      | root-to-leaf nodes: the root is 1, every `and`/`or`/`not` and the condition add 1 |
| `maxConditions`   | `DEFAULT_MAX_CONDITIONS`    | `30`     | `FieldCondition` leaves across all groups                                         |
| `maxInItems`      | `DEFAULT_MAX_IN_ITEMS`      | `200`    | items in one array value (`in`, `notIn`, …)                                       |
| `maxStringLength` | `DEFAULT_MAX_STRING_LENGTH` | `256`    | characters in one string value, also inside an array                              |
| `maxOffset`       | `DEFAULT_MAX_OFFSET`        | `10 000` | offset: `(page - 1) × perPage`; infinite: `offset`. Deeper — use a cursor         |
| `maxSortFields`   | `DEFAULT_MAX_SORT_FIELDS`   | `3`      | fields in the `sort` array                                                        |

```ts
import { resolveLimits } from "@querykitjs/core";

resolveLimits({ maxInItems: 500 }); // the other five keep their defaults
```

Raise a limit for one schema or DTO with its `limits` option; `Infinity` turns a limit off (⚠️ a DoS surface).

## Usage (inside an adapter)

```ts
import { createFilters } from "@querykitjs/core";
import type { Filter } from "@querykitjs/core";

// an adapter specializes it to its own key type:
type MyFilter = Filter<"status" | "age", MyRawSql>;
const f = createFilters<"status" | "age", MyRawSql>();
f.and(f.eq("status", "active"), f.gte("age", 18));
```

### Requirements

|         | Version   | Tested (`bun run test:matrix`) |
| ------- | --------- | ------------------------------ |
| Node.js | `>=22.12` | 24                             |

Node 20 is no longer supported (`engines`: `>=22.12`). Peer ranges cover the last two majors; both ends are tested.

## License

MIT © Suhrobbek Soatov
