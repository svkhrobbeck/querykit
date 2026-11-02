---
name: querykit-web
description: Use when frontend code builds or reads a querykit list request (@querykitjs/web, @querykitjs/web/react) - createRegistry({ adapter }), qk.resource<T>(name), f filters, sort, list / infinite / cursor payloads, withTotal, parseList / parseInfinite / parseCursor, search, adapter-aware with, defineListSchema and URL helpers (readListParams, setPage, setSort), useListParams / useListParamsBase (clamped), fromSearchParams for SSR, query keys, or reading a 400 with isQueryKitError.
---

## Safety rules

- DO treat the server as the authority: `filterable`, `sortable` and the filter limits live in the backend repository and its validator. The web package does not repeat them, so a refused filter comes back as a 400.
- DON'T write `page` / `perPage` / `limit` math by hand. Build every payload with `resource.list` / `infinite` / `cursor` (or `buildListParams` …): `perPage` and `limit` are clamped to `200`, and an offset past `maxOffset` (`10000`) or more than `maxSortFields` (`3`) sort fields throws an `Error`. Use a cursor for deep pages.
- DO read list state from the URL with `readListParams`, `fromSearchParams` or `useListParams`: they never throw, they clamp a too-deep `page` or too-long `sort` and report it as `clamped: true` (`clamped` is not sent to the server).
- DON'T send `columns`, `with` or `withDeleted` unless the backend opened them on purpose (validator `allow`, repository `relations`). In `with`, name only the relations and columns the backend lists in `relations`; anything else is `forbidden-key`.
- DO send dates as ISO strings: the wire is JSON.
- DO read a 400 body with `isQueryKitError(body)` and use its `reason`, `site` and `key` (for example, mark the field named by `key`).
- DO handle `withTotal: false`: `meta.totalCount` and `meta.totalPages` are then `null`, so show "next" / "previous" from `hasNext` / `hasPrev` instead of a page count.

## When to use

- A browser or SSR frontend (React, Next.js, any fetch client) that talks to a querykit backend.
- Building list, infinite-scroll or cursor request bodies, keeping filters in the URL, and caching with TanStack Query or SWR.

The package builds the payload only. You send the request yourself.

## Setup

```ts
import { createRegistry } from "@querykitjs/web";

interface User {
  id: number;
  name: string;
  status: "active" | "blocked";
  createdAt: string;
}

export const qk = createRegistry({
  adapter: "drizzle-pg", // "mongoose" | "drizzle-pg" | "drizzle-sqlite" | "prisma-pg" — types `with` only
  defaults: { perPage: 20, limit: 20 },
  timestamps: { createdAt: "createdAt" }, // same name as the backend; the default sort is this field, desc
});
export const users = qk.resource<User>("users"); // the name is the cache-key namespace
```

## Common tasks

### Filter, sort and an offset page

```ts
import { createRegistry } from "@querykitjs/web";

const users = createRegistry({ adapter: "prisma-pg" }).resource<{ id: number; name: string; age: number; createdAt: string }>("users");
const { f } = users;

const body = users.list({
  filter: f.and(f.gte("age", 18), f.or(f.contains("name", "ali"), f.isNull("age"))),
  sort: [
    { key: "name", direction: "asc" },
    { key: "createdAt", direction: "desc" },
  ],
  page: 2,
  perPage: 20,
  withTotal: false, // the server skips the count
});
const res = await fetch("/api/users/list", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const { data, meta } = users.parseList(await res.json());
console.log(data.length, meta.totalCount ?? "unknown", meta.hasNext);
```

### Infinite scroll and cursor payloads

```ts
import { createRegistry } from "@querykitjs/web";

const posts = createRegistry({ adapter: "mongoose" }).resource<{ _id: string; title: string; createdAt: string }>("posts");

const feedBody = posts.infinite({ limit: 20, offset: 40 });
const firstPage = posts.cursor({ limit: 20, order: "desc", cursorKey: "createdAt" }); // no sort on a cursor
declare const raw: unknown;
const feed = posts.parseInfinite(raw as Parameters<typeof posts.parseInfinite>[0]);
const page = posts.parseCursor(raw as Parameters<typeof posts.parseCursor>[0]);
const nextBody = posts.cursor({ limit: 20, order: "desc", cursorKey: "createdAt", cursor: page.meta.nextCursor });
console.log(feedBody, firstPage, feed.meta.hasMore, feed.meta.nextOffset, nextBody);
```

### Search box across several fields

```ts
import { createRegistry } from "@querykitjs/web";

const users = createRegistry({ adapter: "drizzle-pg" }).resource<{ id: number; name: string; email: string }>("users");

const filter = users.search("ali", ["name", "email"], { operation: "startsWith" }); // OR of startsWith
const body = users.list({ filter, page: 1 });
console.log(body);
```

### Relations with an adapter-aware `with`

```ts
import { createRegistry } from "@querykitjs/web";

const posts = createRegistry({ adapter: "drizzle-pg" }).resource<{ id: number; title: string }>("posts");

// only relations and columns the backend lists in `relations`
const body = posts.list({ with: { author: { columns: { name: true } } }, page: 1 });
console.log(body.with);
```

### Filters in the URL

```ts
import { defineListSchema, readListParams, setPage, setSort } from "@querykitjs/web";

const schema = defineListSchema({
  status: { operation: "=", default: "active" },
  q: { search: ["name", "email"] },
  createdAt: { range: ["fromDate", "toDate"] },
});

const read = readListParams(schema, new URLSearchParams("page=9999&size=20&q=ali"));
console.log(read.page, read.clamped); // 501 true — clamped, never thrown

let sp = new URLSearchParams(location.search);
sp = setPage(sp, 2);
sp = setSort(sp, [{ key: "name", direction: "asc" }]); // resets the page
history.replaceState(null, "", `?${sp.toString()}`);
```

### React list page with `useListParams`

```tsx
import { createRegistry } from "@querykitjs/web";
import { useListParams } from "@querykitjs/web/react";

const users = createRegistry({ adapter: "mongoose" }).resource<{ _id: string; name: string; status: string }>("users");
const usersSchema = users.schema({ name: { operation: "%_%", trim: true }, status: { operation: "=" } });

export function UsersListPage() {
  const { params, clamped, setParam, setPage } = useListParams(users, { schema: usersSchema });
  if (clamped) setPage(params.page ?? 1); // fix a hand-edited URL
  return (
    <div>
      <input placeholder="Name" onChange={event => setParam("name", event.target.value)} />
      <pre>{JSON.stringify(users.keys.list(params))}</pre>
    </div>
  );
}
```

### SSR payload and a refused request

```ts
import { createRegistry, isQueryKitError } from "@querykitjs/web";

const users = createRegistry({ adapter: "prisma-pg" }).resource<{ id: number; name: string }>("users");
const usersSchema = users.schema({ name: { operation: "%_%", trim: true } });

export async function loadUsers(searchParams: URLSearchParams) {
  const body = users.fromSearchParams(searchParams, { schema: usersSchema });
  const res = await fetch("https://api.example.com/users/list", { method: "POST", body: JSON.stringify(body) });
  const json: unknown = await res.json();
  if (res.status === 400) {
    const error = (json as { error?: unknown }).error;
    if (isQueryKitError(error)) return { fieldError: { key: error.key, reason: error.reason, site: error.site } };
  }
  return users.parseList(json as Parameters<typeof users.parseList>[0]);
}
```

## Request contract

The same JSON shape as every querykit package (`@querykitjs/core`): conditions `{ key, operation?, value? }`, groups `{ and }` / `{ or }` / `{ not }` (a flat array = AND), `sort` always `[{ key, direction? }]`, offset `page` / `perPage` / `withTotal`, infinite `limit` / `offset`, cursor `limit` / `cursor` / `cursorKey` / `order` / `direction` (no `sort`). Meta is snake_case: `total_items`, `total_pages`, `has_next`, `has_more`, `next_offset`, `next_cursor`, `prev_cursor`. The body types are `WireOffsetParams`, `WireInfiniteParams` and `WireCursorParams`; validate with `@querykitjs/zod` or `@querykitjs/class-validator`, then pass the body as is. Refusals are `QueryKitError` with `{ source, site, key, operation?, reason }`.

`parseList` / `parseInfinite` / `parseCursor` map that meta to camelCase: `totalCount`, `totalPages`, `currentPage`, `perPage`, `hasNext`, `hasPrev`; `limit`, `offset`, `count`, `hasMore`, `nextOffset`; `nextCursor`, `prevCursor`.

## Mistakes to avoid

- Expecting `list` / `infinite` / `cursor` to fetch: they return a plain payload object, synchronously.
- Passing `sort` to `cursor`: cursor pages order by `cursorKey` with `order` and `direction`.
- Computing `meta.totalCount + 1` without a `null` check: it is `null` after `withTotal: false`.
- Validating filter size in the browser: depth, condition count and string length are checked by the server only.
- Using `useListParams` outside react-router: use `useListParamsBase` with your own `searchParams` and `setSearchParams`.
