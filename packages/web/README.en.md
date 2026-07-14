<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykit/web

> Typed **query-building** for frontends: build filter/sort/pagination payloads, map response meta, sync URL state. It **does not send requests** — you pass the payload to your own `fetch`/`axios`.

React dashboards hand-write the same boilerplate on every list page: build `IFilter[]` from `searchParams`, drop empty filters, `sortType` ↔ `{name,direction}`, "reset page on any change", snake→camel meta. `@querykit/web` removes all of it. The payload matches what the querykit backend (`@querykit/drizzle-pg`) accepts.

```ts
import { buildListParams, f, mapMeta } from "@querykit/web";

const params = buildListParams({
  filter: f.and(f.contains("buyerName", search), f.eq("status", status)),
  sort: "-createdAt",
  page,
  perPage: 20,
});
const { data, meta } = (await http.post("/buyers/list", params)).data; // your own axios/fetch
setMeta(mapMeta(meta));
```

## Features

- **Two filter styles** — `f.eq()...` builder AND object/array (`{key, operation, value}`). Fully compatible with legacy `IFilter[]`.
- **Normalization** — empty-filter pruning, sort decoding. Values pass through unchanged.
- **Declarative schema** — `defineListSchema` maps URL params → filters; kills per-page hand-building.
- **URL-state sync** — `searchParams` ↔ params, `sortType` encode/decode, page-reset. `searchParams` is injected (router-agnostic).
- **React hook** — `useListParams` (peer `react`, `./react` subpath).
- **`mapMeta`** — snake→camel pagination meta.
- **Zero dependency** — no axios/react-query/react-router/dayjs. `react` is an optional peer, only for the hook.

## Install

```bash
bun add @querykit/web
# For the React hook, having react in your project (peer) is enough
```

## Filters — two styles

```ts
import { createFilters } from "@querykit/web";
const f = createFilters<Buyer>(); // column-name autocomplete

// 1) Builder
filter: f.and(f.contains("buyerName", s), f.eq("status", st));

// 2) Object/array (like idistr) — a flat array is implicit AND
filter: [
  { key: "buyerName", operation: "%_%", value: s },
  { key: "status", operation: "=", value: st },
];
```

**Operators:** `= != > >= < <=`, `%_%`/`contains`, `%_`/`startsWith`, `_%`/`endsWith`, `like`, `ilike`, `notLike`, `in`, `notIn`, `between`, `isNull`, `isNotNull` (same set as the querykit backend). Builder helpers: `f.eq/ne/gt/gte/lt/lte`, `f.contains/startsWith/endsWith`, `f.like/ilike/notLike`, `f.in/notIn`, `f.between`, `f.range` (date range → two conditions), `f.isNull/isNotNull`, `f.and/or/not`.

## Building the payload

```ts
import { buildParams, buildListParams } from "@querykit/web";

const payload = buildListParams({
  filter, // builder or array
  sort: "-createdAt", // or { name, direction }
  page,
  perPage: 20,
  with: { supervisor: true }, // relations (default `with`)
});
// -> { filter:[...pruned], sort:{name,direction}, columns, with, page, perPage }
```

Empty filters are dropped (`""`/`null`/`undefined`/`[]`), but `0`/`false` are kept. Values are sent through unchanged.

## Pagination modes (offset / infinite / cursor)

Three builders matching the backend's three modes. Each mode's response meta is **different**, so there's a separate mapper for each:

```ts
import { buildListParams, buildInfiniteParams, buildCursorParams, mapMeta, mapInfiniteMeta, mapCursorMeta } from "@querykit/web";

// 1) Offset — page / perPage
const p = buildListParams({ filter, page: 2, perPage: 20 });
mapMeta(res.meta); // { totalPages, totalCount, currentPage, perPage, hasNext, hasPrev }

// 2) Infinite — limit / offset
const p = buildInfiniteParams({ filter, limit: 20, offset: 40 });
mapInfiniteMeta(res.meta); // { limit, offset, count, hasMore, nextOffset }

// 3) Cursor — limit / cursor / order / direction (sort is ignored)
const p = buildCursorParams({ filter, limit: 20, cursor, order: "asc" });
mapCursorMeta(res.meta); // { limit, hasNext, hasPrev, nextCursor, prevCursor }

// withDeleted — include soft-deleted rows
buildListParams({ filter, withDeleted: true });
```

## Declarative list schema

Declare once instead of hand-building `IFilter[]` on each page:

```ts
import { defineListSchema, searchParamsToPayload } from "@querykit/web";

const buyersSchema = defineListSchema({
  id: { operation: "=" },
  buyerName: { operation: "%_%", trim: true },
  status: { operation: "=" },
  createdAt: { range: ["fromDate", "toDate"] }, // → >= and <=
});

const params = searchParamsToPayload(buyersSchema, searchParams);
```

## React hook

```tsx
import { useSearchParams } from "react-router-dom"; // or any source
import { useListParams } from "@querykit/web/react";

function BuyersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { params, setParam, setPage, setSort } = useListParams({
    searchParams,
    setSearchParams,
    schema: buyersSchema,
  });

  const { data, meta } = useMyList(params); // your own fetch/react-query

  // setParam("status", "active")  -> updates URL, resets page
  // setPage(2), setSort("-createdAt")
}
```

`searchParams` (`URLSearchParams`) and `setSearchParams` are injected — the library is not tied to `react-router`.

## You send the request

The library only handles the work **up to** the request. No transport:

```ts
// fetch
const res = await fetch("/api/buyers/list", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(params),
});
const { data, meta } = await res.json();

// axios
const { data } = await http.post("/buyers/list", params);
setMeta(mapMeta(data.meta));
```

## Other / legacy backends (custom field names)

Defaults are querykit-canonical camelCase (`perPage`, `with`). For a legacy snake-case backend (e.g. idistr), configure it:

```ts
import { createQuery } from "@querykit/web";

const q = createQuery({ perPageField: "per_page", withField: "withPopulates" });
const params = q.list({ filter, page, perPage });
```

## API reference

| Function                                       | Purpose                                |
| ---------------------------------------------- | -------------------------------------- |
| `createFilters<T>()` / `f`                     | typed / untyped filter builder         |
| `buildParams(input)`                           | normalize params (no pagination)       |
| `buildListParams(input)`                       | + `page`/`perPage` (offset)            |
| `buildInfiniteParams(input)`                   | + `limit`/`offset` (infinite)          |
| `buildCursorParams(input)`                     | + `limit`/`cursor`/`order`/`direction` |
| `createQuery(config)`                          | builder with custom field names        |
| `defineListSchema(schema)`                     | URL param → filter descriptor          |
| `schemaToFilter(schema, sp)`                   | searchParams → `FieldCondition[]`      |
| `searchParamsToPayload(schema, sp)`            | searchParams → full payload            |
| `readListParams(schema, sp)`                   | searchParams → `ListParams`            |
| `setParam/setPage/setSize/setSort/resetParams` | URL writes (immutable, page-reset)     |
| `encodeSort/decodeSort`                        | `{name,direction}` ↔ `"-createdAt"`    |
| `mapMeta(raw)`                                 | offset meta → camel                    |
| `mapInfiniteMeta(raw)`                         | infinite meta → camel                  |
| `mapCursorMeta(raw)`                           | cursor meta → camel                    |
| `useListParams(opts)` (`/react`)               | URL-sync hook                          |

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run build       # tsup -> dist (index + react, ESM + CJS + .d.ts)
bun run --filter @querykit/web test:smoke
```

## License

MIT © Suhrobbek Soatov
