---
name: querykit-tanstack-query
description: Use when frontend code fetches a querykit list with TanStack Query (@querykitjs/tanstack-query) - listOptions / infiniteOptions / cursorOptions / detailOptions from a @querykitjs/web resource for useQuery, useInfiniteQuery, queryClient.fetchQuery or prefetch, the Fetcher(payload, { signal }) contract, query keys and invalidation with resource.keys, or infinite and cursor paging both ways.
---

## Safety rules

- DO pass `signal` from the fetcher context to your HTTP client: TanStack cancels a stale request through it.
- DO send the payload as it is: it is already capped and normalized by the registry (`perPage` / `limit` ≤ `200`, sort shape, empty filter pruning). DON'T rebuild it by hand.
- DON'T put `offset` or `cursor` into your own query keys for infinite lists: the options leave the page param out on purpose, so all pages share one cache entry.
- DO invalidate with `resource.keys` (`users.keys.all`): the options use exactly those keys.
- DON'T expect hooks from this package: it returns plain option objects; call your framework's `useQuery` / `useInfiniteQuery` with them.

## When to use

- A React, Vue, Solid or Svelte app on TanStack Query v5 that talks to a querykit backend through a `@querykitjs/web` registry.
- Server code that prefetches with `queryClient.fetchQuery` / `fetchInfiniteQuery`.

## Setup

```ts
import { createRegistry } from "@querykitjs/web";
import { listOptions } from "@querykitjs/tanstack-query";
import { QueryClient } from "@tanstack/query-core";

// your HTTP client (axios, ky, ofetch…); the payload is the JSON body the backend expects
declare const api: { post<T>(url: string, body: unknown, options: { signal: AbortSignal }): Promise<T> };

const qk = createRegistry({ adapter: "drizzle-pg" });
const users = qk.resource<{ id: number; name: string }>("users");

const queryClient = new QueryClient();
const page = await queryClient.fetchQuery(listOptions(users, { page: 1 }, (body, { signal }) => api.post("/api/users/list", body, { signal }))); // in React: useQuery(listOptions(...))
console.log(page.meta.totalPages, page.data.length);
```

## Common tasks

### Infinite scroll and a two-way cursor feed

```ts
import { createRegistry } from "@querykitjs/web";
import { cursorOptions, infiniteOptions, type Fetcher } from "@querykitjs/tanstack-query";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/query-core";

const posts = createRegistry({ adapter: "mongoose" }).resource<{ _id: string; title: string }>("posts");
declare const post: Fetcher<unknown, never>;
const queryClient = new QueryClient();

// useInfiniteQuery(infiniteOptions(...)) — next page = meta.nextOffset
const feed = new InfiniteQueryObserver(queryClient, infiniteOptions(posts, { limit: 20 }, post));
await feed.fetchNextPage();

// useInfiniteQuery(cursorOptions(...)) — next = nextCursor, previous = prevCursor with direction "backward"
const timeline = new InfiniteQueryObserver(queryClient, cursorOptions(posts, { limit: 20, cursorKey: "createdAt", order: "desc" }, post));
await timeline.fetchPreviousPage();
```

### Invalidate after a write

```ts
import { createRegistry } from "@querykitjs/web";
import { QueryClient } from "@tanstack/query-core";

const users = createRegistry({ adapter: "prisma-pg" }).resource<{ id: number }>("users");
const queryClient = new QueryClient();

await queryClient.invalidateQueries({ queryKey: users.keys.all }); // every list, infinite, cursor and detail query of "users"
```

### One record

```ts
import { createRegistry } from "@querykitjs/web";
import { detailOptions } from "@querykitjs/tanstack-query";
import { QueryClient } from "@tanstack/query-core";

declare const api: { get<T>(url: string, options: { signal: AbortSignal }): Promise<T> };

const users = createRegistry({ adapter: "drizzle-pg" }).resource<{ id: number; name: string }>("users");
const user = await new QueryClient().fetchQuery(
  detailOptions(users, 7, (id, { signal }) => api.get<{ id: number; name: string }>(`/api/users/${id}`, { signal })),
);
console.log(user.name);
```
