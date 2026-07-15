<div align="right">

**English** · [O'zbekcha](./README.md)

</div>

# @querykitjs/web

[![npm](https://img.shields.io/npm/v/@querykitjs/web.svg)](https://www.npmjs.com/package/@querykitjs/web) [![license](https://img.shields.io/npm/l/@querykitjs/web.svg)](./LICENSE)

> Typed **query-building** for frontends: build filter/sort/pagination payloads, map response meta, sync URL state. It **does not send requests** — you pass the payload to your own `fetch`/`axios`. Zero-dependency.

React dashboards hand-write the same boilerplate on every list page: build `IFilter[]` from `searchParams`, drop empty filters, `sortType` ↔ `[{key,direction}]` (multi-field), "reset page on any change", snake→camel meta. `@querykitjs/web` removes all of it. The payload matches what the querykit backend (`@querykitjs/drizzle-pg`, a mongoose adapter, …) accepts.

```ts
// src/lib/query.ts — configure once
import { createRegistry } from "@querykitjs/web";

export const qk = createRegistry({
  adapter: "drizzle-pg", // tailors `with` intellisense to the backend
  defaults: { perPage: 20, sort: ["-createdAt"] },
});
```

```tsx
// any list page — the whole boilerplate collapses into one hook
import { useQuery } from "@tanstack/react-query";
import { useListParams } from "@querykitjs/web/react";
import { qk } from "@/lib/query";

const users = qk.resource<IUser>("users");
const usersSchema = users.schema({ name: { operation: "%_%", trim: true }, status: { operation: "=" } });

function UsersPage() {
  const { params, setParam, setPage } = useListParams(users, { schema: usersSchema });
  const { data } = useQuery({
    queryKey: users.keys.list(params),
    queryFn: async () => users.parseList((await axios.post("/users/list", params)).data),
  });
  // data = { data: IUser[], meta: { totalPages, currentPage, hasNext, … } }
}
```

## Features

- **Registry** — configure `adapter` + defaults once; `resource<T>()` gives entity-typed, adapter-aware builders/filters/schema/keys/parsers.
- **Two filter styles** — `f.eq()...` builder (operators typed per field) AND object/array (`{key, operation, value}`). Fully compatible with legacy `IFilter[]`.
- **3 pagination modes** — offset (`list`), infinite (`infinite`), cursor/keyset (`cursor`); each has its own `parse*` to camelCase the meta.
- **Adapter-aware `with`** — only **wire-safe** (JSON) per-relation options are suggested for `mongoose`/`drizzle-pg`/`drizzle-sqlite`/`prisma-pg`; function/SQL forms are never offered.
- **Declarative schema** — `resource.schema` / `defineListSchema` maps URL params → filter; kills the per-page hand-building.
- **React hooks** — `useListParams` (react-router-dom inside), `useListParamsBase` (router-agnostic). Framework-agnostic core — Vue can bind the same core.
- **SSR** — `resource.fromSearchParams(sp, {schema})` builds a payload straight from `URLSearchParams`, no hook.
- **Query keys** — `resource.keys` gives stable keys for TanStack/SWR.
- **Zero dependency** — no axios/react-query/dayjs. `react` (+ `react-router-dom` for the hook) are optional peers.

## Install

```bash
bun add @querykitjs/web
# React hook: react (peer). `useListParams` also peers react-router-dom.
# The router-agnostic `useListParamsBase` needs no react-router-dom.
```

## Two ways to use it

```ts
// (A) Registry — configure once, get entity-typed + adapter-aware builders
import { createRegistry } from "@querykitjs/web";

// (B) Standalone — free-form, always available
import { buildListParams, f } from "@querykitjs/web";
```

Use (A) when you want defaults in one place, autocomplete, adapter `with`, query keys, meta parsing. Use (B) for one-off/free-form building.

## `createRegistry(config)` — configure once

```ts
export const qk = createRegistry({
  adapter: "mongoose", // "mongoose" | "drizzle-pg" | "drizzle-sqlite" | "prisma-pg"
  defaults: {
    perPage: 20, // list (offset) page size
    limit: 20, // infinite + cursor page size
    sort: ["-createdAt"], // list + infinite ordering (leading "-" = desc)
    cursor: { order: "asc" }, // cursor-only key traversal order
  },
  pruneEmpty: true, // drop empty filter values (""/null/undefined/[]); keep 0/false
});
```

| Config                  | Meaning                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `adapter`               | Target backend — tailors `with` typing (intellisense only).                         |
| `defaults.perPage`      | Default `perPage` for `list`.                                                       |
| `defaults.limit`        | Default `limit` for `infinite` and `cursor`.                                        |
| `defaults.sort`         | Default sort for `list`/`infinite` — `[{key,direction}]` or `["-field"]` shorthand. |
| `defaults.cursor.order` | Default cursor traversal order (`"asc"`/`"desc"`).                                  |
| `pruneEmpty`            | Auto-drop empty filter conditions built from form inputs (default `true`).          |

Every default is overridable per call.

## `qk.resource<TEntity>(name)` — the entity layer

```ts
import type { IUser } from "@my/api-types";
export const users = qk.resource<IUser>("users"); // "users" = cache-key namespace (required, unique)
```

| Member                                                        | What it is                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------- |
| `users.list(input)`                                           | build an offset (page) payload                                       |
| `users.infinite(input)`                                       | build an infinite (limit/offset) payload                             |
| `users.cursor(input)`                                         | build a cursor (keyset) payload                                      |
| `users.params(input)`                                         | build a paginationless payload (filter/sort/columns/with)            |
| `users.f`                                                     | `createFilters<IUser>()` — field-typed builder                       |
| `users.search(term, fields)`                                  | OR-of-`contains` preset across `fields`                              |
| `users.schema(desc)`                                          | `defineListSchema` bound (URL ↔ filter)                              |
| `users.fromSearchParams(sp, {schema})`                        | build a list payload straight from `URLSearchParams` (SSR / no hook) |
| `users.keys`                                                  | stable query keys for TanStack/SWR                                   |
| `users.parseList / parseInfinite / parseCursor`               | map response meta snake→camel                                        |
| `ListResult<T> / InfiniteResult<T> / CursorResult<T>` (types) | `parse*` return types                                                |

All builders inherit the registry's `defaults` + `pruneEmpty`; all types are driven by `IUser` and the `adapter`.

> URL setters (`setParam`/`setPage`/`setSort`/`reset`) are config-free — use the standalone `url` helpers or the `useListParams` hook; there is no `users.url`.

## Filters — `f` (field-typed) and object/array

```ts
import { createFilters } from "@querykitjs/web";
const f = createFilters<Buyer>(); // or: const f = users.f;

// 1) Builder — field-name autocomplete + operators typed per field
filter: f.and(f.contains("buyerName", s), f.eq("status", st));

// 2) Object/array (idistr-style) — flat array = implicit AND
filter: [
  { key: "buyerName", operation: "%_%", value: s },
  { key: "status", operation: "=", value: st },
];
```

**Operator-per-field-type:** `f.contains`/`like`/`ilike`/`startsWith`/... are offered only for **string** fields, `f.gt`/`gte`/`between`/... only for **comparable** (string/number/Date) fields:

```ts
f.contains("buyerName", s); // ✓ buyerName: string
f.gte("age", 18); // ✓ age: number
f.contains("age", "x"); // ✗ compile error — `contains` is string-only
```

**Operators:** `= != > >= < <=`, `%_%`/`contains`, `%_`/`startsWith`, `_%`/`endsWith`, `like`, `ilike`, `notLike`, `in`, `notIn`, `between`, `isNull`, `isNotNull`. Builder helpers: `f.eq/ne/gt/gte/lt/lte`, `f.contains/startsWith/endsWith`, `f.like/ilike/notLike`, `f.in/notIn`, `f.between`, `f.range` (date range → two conditions), `f.isNull/isNotNull`, `f.and/or/not`.

**`search` preset** — one input, many columns (OR of contains):

```ts
users.search("ali", ["buyerName", "email"]);
// → or(contains("buyerName","ali"), contains("email","ali"))
```

An untyped `f` is also exported: `import { f } from "@querykitjs/web"` (no field-type checks, quick use).

## Sort — always `[{ key, direction }]` (multi-field)

Sort is **always an array** of `{ key, direction }` items — one shape across the whole querykit stack (frontend + every backend adapter).

```ts
// canonical
users.list({ sort: [{ key: "createdAt", direction: "desc" }] });

// multi-field — ORDER BY name ASC, createdAt DESC
users.list({ sort: [{ key: "name" }, { key: "createdAt", direction: "desc" }] });

// shorthand — the builder maps `"-field"` / `"field"` strings for you
users.list({ sort: ["-createdAt", "name"] }); // → [{ key:"createdAt", direction:"desc" }, { key:"name", direction:"asc" }]
```

**URL round-trip.** `setSort` encodes to a single comma-separated `sortType` param; reading it back decodes to the array — so multi-sort survives the URL:

```ts
setSort(searchParams, ["-createdAt", "id"]); // ?sortType=-createdAt,id
decodeSort("-createdAt,id"); // → [{ key:"createdAt", direction:"desc" }, { key:"id", direction:"asc" }]
```

The **backend only ever receives** the canonical `[{ key, direction }]` — the `"-field"` shorthand is resolved on the frontend, never sent over the wire.

## Builders — inputs and **what they return**

These are **pure, synchronous** functions. They return a **payload object** (not a Promise, not data). You send it yourself.

```ts
// list — offset (page)
users.list({ filter?, sort?, columns?, with?, withDeleted?, page?, perPage? });
// → { filter, sort: [{ key, direction }], columns, with, page, perPage, withDeleted? }

// infinite — limit/offset
users.infinite({ filter?, sort?, columns?, with?, withDeleted?, limit?, offset? });
// → { filter, sort, columns, with, limit, offset }

// cursor — NO sort, uses order + direction
users.cursor({ filter?, columns?, with?, withDeleted?, limit?, cursor?, order?, direction?, cursorKey? });
// → { filter, columns, with, limit, cursor, order, direction, cursorKey? }
```

Empty filter values are pruned (`""`/`null`/`undefined`/`[]`), but `0`/`false` are kept. Values pass through unchanged.

## Pagination + `parse*` (meta)

Three builders for the backend's three modes. Each response meta is **different** (snake_case on the wire), so each has its own parser:

| Builder    | Backend returns                                                                            | `parse*` → camelCase                                                 |
| ---------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `list`     | `{ data, meta: { total_items, total_pages, current_page, per_page, has_next, has_prev } }` | `{ totalCount, totalPages, currentPage, perPage, hasNext, hasPrev }` |
| `infinite` | `{ data, meta: { limit, offset, count, has_more, next_offset } }`                          | `{ limit, offset, count, hasMore, nextOffset }`                      |
| `cursor`   | `{ data, meta: { limit, has_next, has_prev, next_cursor, prev_cursor } }`                  | `{ limit, hasNext, hasPrev, nextCursor, prevCursor }`                |

```ts
const r = users.parseList(res.data); // { data: IUser[], meta: { totalPages, currentPage, hasNext, … } }
users.parseInfinite(res.data); // { data, meta: { hasMore, nextOffset, … } }
users.parseCursor(res.data); // { data, meta: { nextCursor, hasNext, … } }
```

`parse*` exists at two levels (one shared implementation — meta is entity-agnostic):
`qk.parseList/...` (registry, `data: unknown[]`) when you don't have a `resource`; `users.parseList/...` (entity-typed).

## Adapter-aware, wire-safe `with`

The registry types `with` per adapter — **serializable options only**:

| adapter                         | `with[rel]` intellisense                                           | Hidden (not offered)                              |
| ------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| `mongoose`                      | `boolean \| { select?, populate?, match?, options? }`              | —                                                 |
| `drizzle-pg` / `drizzle-sqlite` | `boolean \| { columns?, with?, limit?, offset? }`                  | `where:(f,op)=>…`, `orderBy:(f,op)=>…`, raw `sql` |
| `prisma-pg`                     | `boolean \| { select?, include?, where?, orderBy?, take?, skip? }` | function forms                                    |

```ts
// adapter: "mongoose"
users.list({ with: { author: { select: "name email" } } }); // ✓ `select`
// adapter: "drizzle-pg"
users.list({ with: { author: { columns: { name: true } } } }); // ✓ `columns`; `where`-fn hidden
```

Runtime is unchanged (pass-through) — pure DX. Function/SQL forms aren't offered because you can't send them over JSON anyway.

## Declarative list schema — URL ↔ filter

Instead of hand-building `IFilter[]` on every page, declare it once. `useListParams` (and `schemaToFilter`) applies it: reads each param, applies the operation, prunes empties, fills defaults.

```ts
const dispatchesSchema = dispatches.schema({
  id: { operation: "=" },
  status: { operation: "=", default: "active" }, // ?status absent → "active"
  productIds: { operation: "in", split: "," }, // ?productIds=1,2,3 → in [1,2,3]
  q: { search: ["name", "imei", "appNumber"] }, // ?q=… → contains-OR across fields
  name: { operation: "%_%", trim: true }, // trims the value
  createdAt: { range: ["fromDate", "toDate"] }, // two params → >= and <= (inclusive)
  // price:   { between: ["minPrice", "maxPrice"] },      // OR: one `between` condition (2-tuple)
});
```

### FieldDescriptor modes

| Key                   | Meaning                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operation`           | filter operation (`"="`, `"%_%"`, `"in"`, …). **Explicit** — no `true` shorthand.                                                                   |
| `default`             | value used when the URL param is **absent** (replaces manual `\|\| "active"`).                                                                      |
| `split`               | for array operations (`in`/`notIn`): split a comma-string into an array (default `","`). **Guarded** — absent/empty → pruned (never `[undefined]`). |
| `range: [from, to]`   | two params → **two inclusive** conditions (`>= from`, `<= to`); each bound is independent.                                                          |
| `between: [from, to]` | two params → **one** `between` condition (2-tuple). **Requires both bounds** — one-sided → nothing (use `range` for independent bounds).            |
| `trim`                | trim the string value.                                                                                                                              |
| `search: [fields]`    | one param → OR of `contains` across the listed fields.                                                                                              |

**Exactly one mode per descriptor** — Simple (`operation` + `trim`/`default`/`split`), `range`, `between`, `search` are **mutually exclusive** and enforced at compile time (mixing e.g. `range` + `search` is a type error).

Empty/**absent** params are pruned; `default` fills only when the param is **absent** (an empty `?x=` means "cleared" → pruned, not defaulted).

## React hook

```tsx
import { useListParams } from "@querykitjs/web/react"; // uses react-router-dom internally
import { qk } from "@/lib/query";

const users = qk.resource<IUser>("users");
const usersSchema = users.schema({ name: { operation: "%_%", trim: true }, status: { operation: "=" } });

function UsersListPage() {
  // reads ?page/?size/?sortType/?name/... from the URL (useSearchParams inside)
  const { params, setParam, setPage, setSort, reset } = useListParams(users, {
    schema: usersSchema,
    with: { manager: true }, // fixed relations (not URL-driven)
  });

  const q = useQuery({
    queryKey: users.keys.list(params),
    queryFn: async () => users.parseList((await axios.post("/users/list", params)).data),
    placeholderData: prev => prev, // keep previous page while fetching
  });

  // setParam("status","active") → updates URL, resets page; setPage(2); setSort("-createdAt")
}
```

An input/sort/page change mutates the URL → `params` changes → `queryKey` changes → TanStack refetches (and caches each combo).

**Router-agnostic** (Next.js, TanStack Router) — pass `searchParams` to the base hook (no react-router-dom):

```tsx
import { useListParamsBase } from "@querykitjs/web/react";
const { params, setPage } = useListParamsBase(users, { schema: usersSchema, searchParams, setSearchParams });
```

## SSR — `fromSearchParams` (no hook)

For server components / `getServerSideProps` — a payload straight from the URL:

```ts
// Next.js server component
export default async function Page({ searchParams }) {
  const sp = new URLSearchParams(searchParams);
  const body = users.fromSearchParams(sp, { schema: usersSchema });
  const res = await fetch(`${API}/users/list`, { method: "POST", body: JSON.stringify(body) });
  const { data, meta } = users.parseList(await res.json());
}
```

## Query keys — `users.keys`

Stable, structured keys for TanStack Query / SWR caches:

```ts
users.keys.all; // ["users"]
users.keys.list(payload); // ["users", "list", payload]
users.keys.infinite(payload); // ["users", "infinite", payload]
users.keys.cursor(payload); // ["users", "cursor", payload]
users.keys.detail(id); // ["users", "detail", id]
```

## Full examples

### axios — offset / infinite / cursor

```ts
import { qk } from "@/lib/query";
const users = qk.resource<IUser>("users");

// offset
const listRes = await axios.post("/users/list", users.list({ filter: users.f.eq("status", "active"), page }));
const { data, meta } = users.parseList(listRes.data); // meta.currentPage, meta.totalPages…

// infinite
const infRes = await axios.post("/users/infinite", users.infinite({ limit: 20, offset }));
const inf = users.parseInfinite(infRes.data); // inf.meta.hasMore, inf.meta.nextOffset

// cursor
const curRes = await axios.post("/users/cursor", users.cursor({ limit: 20, cursor }));
const cur = users.parseCursor(curRes.data); // cur.meta.nextCursor, cur.meta.hasNext
```

### TanStack `useQuery` (offset)

```tsx
import { useQuery } from "@tanstack/react-query";
const users = qk.resource<IUser>("users");

function useUsers(filters: { status?: string; search?: string }, page: number) {
  const body = users.list({
    filter: [users.f.eq("status", filters.status), users.f.contains("name", filters.search)],
    sort: ["-createdAt"],
    page,
  });
  return useQuery({
    queryKey: users.keys.list(body), // stable cache key
    queryFn: async () => users.parseList((await axios.post("/users/list", body)).data),
  });
  // data = { data: IUser[], meta: { totalPages, currentPage, hasNext, … } }
}
```

### Infinite scroll — `useInfiniteQuery`

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";
const feed = qk.resource<IPost>("feed");

function useFeed(filter: IPostFilterInput) {
  return useInfiniteQuery({
    queryKey: feed.keys.infinite({ filter }),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => feed.parseInfinite((await axios.post("/feed/infinite", feed.infinite({ filter, offset: pageParam, limit: 20 }))).data),
    getNextPageParam: last => (last.meta.hasMore ? last.meta.nextOffset : undefined),
  });
  // const rows = data?.pages.flatMap(p => p.data) ?? [];
}
```

### Cursor (keyset) — `useInfiniteQuery`, bidirectional

```tsx
const feed = qk.resource<IPost>("feed");

function useCursorFeed(filter: IPostFilterInput) {
  return useInfiniteQuery({
    queryKey: feed.keys.cursor({ filter }),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, direction }) =>
      feed.parseCursor(
        (
          await axios.post(
            "/feed/cursor",
            feed.cursor({
              filter,
              cursor: pageParam,
              limit: 20,
              order: "asc", // fixed feed order
              direction: direction === "backward" ? "backward" : "forward",
            }),
          )
        ).data,
      ),
    getNextPageParam: last => (last.meta.hasNext ? last.meta.nextCursor : undefined),
    getPreviousPageParam: first => (first.meta.hasPrev ? first.meta.prevCursor : undefined),
  });
}
```

`order` is the stable feed order (constant); TanStack's forward/backward maps to the payload's `direction`, and the cursor tokens (`nextCursor`/`prevCursor`) come from the mapped meta.

## Standalone (no registry) — free-form

A registry is optional — the builders work directly:

```ts
import { buildListParams, buildInfiniteParams, buildCursorParams, f } from "@querykitjs/web";

const body = buildListParams({
  filter: f.and(f.contains("name", search), f.eq("status", status)),
  sort: ["-createdAt"],
  page,
  perPage: 20,
  with: { supervisor: true },
});
const res = await axios.post("/users/list", body);
const { data, meta } = qk.parseList(res.data); // registry parse* for meta (entity-agnostic)
```

`createQuery(config)` — for defaults/`pruneEmpty` without a registry. Wire field names are fixed by the querykit contract (`filter`/`sort`/`columns`/`with`/`page`/`perPage`/`limit`/`offset`/`cursor`/`withDeleted`).

```ts
import { createQuery } from "@querykitjs/web";
const q = createQuery({ defaultPerPage: 20, pruneEmpty: true });
const params = q.list({ filter, page });
```

## You send the request yourself

The library works only **up to the request**. No transport:

```ts
const res = await fetch("/api/users/list", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(params),
});
const { data, meta } = users.parseList(await res.json());
```

## API reference

| Function / member                                                                 | What it does                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `createRegistry(config)`                                                          | registry with adapter + defaults                        |
| `registry.resource<T>(name)`                                                      | entity-typed builders/filters/schema/keys/parsers       |
| `resource.list/infinite/cursor/params(input)`                                     | build a payload (offset/infinite/cursor/paginationless) |
| `resource.f` / `createFilters<T>()` / `f`                                         | typed filter builder / typed / untyped                  |
| `resource.search(term, fields)`                                                   | OR-of-contains preset                                   |
| `resource.schema(desc)` / `defineListSchema(desc)`                                | URL param → filter descriptor                           |
| `resource.fromSearchParams(sp, {schema})`                                         | searchParams → list payload (SSR)                       |
| `resource.keys`                                                                   | TanStack/SWR query keys                                 |
| `resource.parseList/parseInfinite/parseCursor`                                    | response meta → camelCase                               |
| `qk.parseList/parseInfinite/parseCursor`                                          | registry-level parse (entity-agnostic)                  |
| `buildParams / buildListParams / buildInfiniteParams / buildCursorParams`         | standalone builders                                     |
| `createQuery(config)`                                                             | builder without a registry (defaults/pruneEmpty)        |
| `schemaToFilter(schema, sp)`                                                      | searchParams → `FieldCondition[]`                       |
| `searchParamsToPayload(schema, sp)`                                               | searchParams → full payload                             |
| `readListParams(schema, sp)`                                                      | searchParams → `ListParams`                             |
| `setParam/setPage/setSize/setSort/resetParams`                                    | write URL (immutable, page-reset)                       |
| `encodeSort/decodeSort`                                                           | `[{key,direction}]` ↔ `"-createdAt,id"` (multi-field)   |
| `useListParams(resource, {schema})` (`/react`)                                    | URL-sync hook (react-router-dom)                        |
| `useListParamsBase(resource, {schema, searchParams, setSearchParams})` (`/react`) | router-agnostic hook                                    |

## Development

```bash
bun install
bun run typecheck
bun run lint
bun run build       # tsup -> dist (index + react, ESM + CJS + .d.ts)
bun run --filter @querykitjs/web test:smoke
```

## License

MIT © Suhrobbek Soatov
