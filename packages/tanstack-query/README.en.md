# @querykitjs/tanstack-query

> Ready [TanStack Query](https://tanstack.com/query) options from a querykit resource — list, infinite and cursor queries with keys, fetch, meta parsing and page params.

[O'zbekcha](./README.md)

One call per query, the same code for React, Vue, Solid and Svelte Query:

```ts
const { data } = useQuery(listOptions(users, { page: 2 }, fetcher));
const feed = useInfiniteQuery(cursorOptions(posts, { limit: 20 }, fetcher));
```

The keys are [`resource.keys`](../web/README.en.md#query-keys--userskeys), so your existing invalidation keeps working.

## Install

```bash
npm i @querykitjs/tanstack-query @querykitjs/web @tanstack/react-query   # or vue-query, solid-query, svelte-query
```

### Requirements

|                        | Version   | Tested (`bun run test:matrix`) |
| ---------------------- | --------- | ------------------------------ |
| Node.js                | `>=22.12` | 24                             |
| `@tanstack/query-core` | `^5.0.0`  | 5.0.0, 5.104.5                 |
| `@querykitjs/web`      | `^4.0.0`  | workspace                      |

TanStack Query lives on one major (v4's API is different), so the range starts at its first v5 release. There are no runtime dependencies.

## The fetcher

You send the request — your HTTP client, base URL and auth:

```ts
import type { Fetcher } from "@querykitjs/tanstack-query";

const fetcher = <R>(path: string) => ((body, { signal }) => api.post<R>(path, body, { signal })) satisfies Fetcher<unknown, R>;
```

`(payload, { signal }) => Promise<raw server body>` — pass `signal` on so TanStack can cancel a stale request. The options parse the body with `resource.parseList` / `parseInfinite` / `parseCursor`.

## Options

| Export                                      | For                | Key                                     | Page params                                                                                                            |
| ------------------------------------------- | ------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `listOptions(resource, input, fetcher)`     | `useQuery`         | `keys.list(payload)`                    | —                                                                                                                      |
| `infiniteOptions(resource, input, fetcher)` | `useInfiniteQuery` | `keys.infinite(payload without offset)` | `initialPageParam: offset`, next = `meta.nextOffset`                                                                   |
| `cursorOptions(resource, input, fetcher)`   | `useInfiniteQuery` | `keys.cursor(payload without cursor)`   | `initialPageParam: cursor`, next = `meta.nextCursor`, previous = `meta.prevCursor` (sent with `direction: "backward"`) |
| `detailOptions(resource, id, fetcher)`      | `useQuery`         | `keys.detail(id)`                       | —                                                                                                                      |

`input` is what `resource.list()` / `infinite()` / `cursor()` takes, or a payload `useListParams` already built. Infinite and cursor keys leave the page param out, so all pages share one cache entry.

```ts
// prefetch on the server
await queryClient.prefetchQuery(listOptions(users, { page: 1 }, fetcher("/users/list")));
// invalidate after a write
await queryClient.invalidateQueries({ queryKey: users.keys.all });
```

There are no hooks and no mutation options: the package only builds option objects.

## Agent skill

The package ships `skills/querykit-tanstack-query/SKILL.md` for AI coding assistants.

## License

MIT
