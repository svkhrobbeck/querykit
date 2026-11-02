---
"@querykitjs/web": minor
"@querykitjs/zod": minor
"@querykitjs/class-validator": minor
---

The web package follows the 012–014 backend contract (task 015).

- **`timestamps`** registry option `{ createdAt? }`: names the default `list` / `infinite` sort field (`[{ key: createdAt, direction: "desc" }]`), like the backend registry; `defaults.sort` still wins.
- **`withTotal`**: `buildListParams` / `resource.list` send `withTotal` when given; `parseList` keeps a server `null` total — `Meta.totalCount` / `Meta.totalPages` are typed `number | null` (an absent total is still `0`). zod (`makeOffsetParamsSchema`, `offsetParamsSchema`) and class-validator (`makeOffsetParamsDto`, `OffsetParamsDto`) accept `withTotal`.
- **`isQueryKitError(body)`** and `QueryKitErrorBody`: recognise the `QueryKitError.info` shape (`reason`, `site`, `key`) in a 400 response.
- **`resource.search(term, fields, { operation })`**: `contains` (default, unchanged), `startsWith` or `endsWith`.
- **URL readers clamp instead of throwing**: `readListParams`, `searchParamsToPayload`, `resource.fromSearchParams` and the hooks cut a URL `page` past `maxOffset` to the last allowed page and a sort past `maxSortFields` to its first fields, with `clamped: true` (non-enumerable on payloads — never sent); the hooks return `clamped`. Direct builder calls still throw.
